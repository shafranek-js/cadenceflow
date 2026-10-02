import { describe, expect, it, vi } from "vitest";
import type {
  AudioClock,
  AudioNoteEvent,
  InstrumentAudioProvider,
  ScheduledPlayback,
} from "../../../src/audio/contracts";
import { PreviewAuditionController } from "../../../src/audio/previewAudition";

function event(pitch = 60): AudioNoteEvent {
  return {
    pitch,
    startSeconds: 0,
    durationSeconds: 0.5,
    velocity: 90,
    channelRole: "upper",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function provider(overrides: Partial<InstrumentAudioProvider> = {}) {
  let state: InstrumentAudioProvider["state"] = "idle";
  const prepare = vi.fn(async () => {
    state = "ready";
  });
  const schedule = vi.fn((_events: readonly AudioNoteEvent[], clock: AudioClock) => {
    const playback: ScheduledPlayback = {
      id: "scheduled-preview",
      scheduledAt: clock.now(),
      cancel: vi.fn(),
    };
    return playback;
  });
  return {
    get instance() {
      return {
        id: "instrumented-provider",
        get state() {
          return state;
        },
        prepare,
        schedule,
        stop: vi.fn(),
        dispose: vi.fn(async () => {}),
        ...overrides,
      } satisfies InstrumentAudioProvider;
    },
    prepare,
    schedule,
    setState(next: InstrumentAudioProvider["state"]) {
      state = next;
    },
  };
}

describe("PreviewAuditionController scheduling notification", () => {
  it("waits for delayed preparation and reports the provider audio-clock schedule", async () => {
    const loading = deferred<void>();
    const instrument = provider({ prepare: () => loading.promise });
    const clock = { now: () => 42.25 };
    const onScheduled = vi.fn();
    const controller = new PreviewAuditionController({ provider: instrument.instance, clock });

    expect(controller.audition([event()], onScheduled)).toBeNull();
    expect(onScheduled).not.toHaveBeenCalled();
    expect(instrument.schedule).not.toHaveBeenCalled();
    instrument.setState("ready");
    loading.resolve();
    await loading.promise;
    await Promise.resolve();

    expect(instrument.schedule).toHaveBeenCalledOnce();
    expect(onScheduled).toHaveBeenCalledOnce();
    expect(onScheduled.mock.calls[0]?.[0].scheduledAt).toBe(42.25);
    expect(onScheduled.mock.calls[0]?.[1]).toBe(clock);
  });

  it("does not start a playhead after failed preparation or a replaced pending request", async () => {
    const failed = deferred<void>();
    const broken = provider({ prepare: () => failed.promise });
    const failureStart = vi.fn();
    const failedController = new PreviewAuditionController({ provider: broken.instance });
    failedController.audition([event()], failureStart);
    failed.reject(new Error("prepare failed"));
    await failed.promise.catch(() => undefined);
    await Promise.resolve();
    expect(failureStart).not.toHaveBeenCalled();
    expect(broken.schedule).not.toHaveBeenCalled();

    const pending = deferred<void>();
    const replaced = provider({ prepare: () => pending.promise });
    const replacedStart = vi.fn();
    const controller = new PreviewAuditionController({ provider: replaced.instance });
    controller.audition([event(60)], replacedStart);
    controller.stop();
    replaced.setState("ready");
    pending.resolve();
    await pending.promise;
    await Promise.resolve();
    expect(replacedStart).not.toHaveBeenCalled();
    expect(replaced.schedule).not.toHaveBeenCalled();
  });
});
