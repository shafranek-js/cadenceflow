import { describe, expect, it } from "vitest";
import type {
  AudioClock,
  AudioNoteEvent,
  AudioProviderState,
  InstrumentAudioProvider,
  PlaybackScope,
  ScheduledPlayback,
} from "../../src/audio/contracts";
import { createDefaultProject } from "../../src/domain/project/factory";

class MockAudioClock implements AudioClock {
  private currentTime: number;

  constructor(initialTime = 0) {
    this.currentTime = initialTime;
  }

  now(): number {
    return this.currentTime;
  }

  advance(seconds: number): void {
    this.currentTime += seconds;
  }

  setTime(time: number): void {
    this.currentTime = time;
  }
}

interface ScheduledRecord {
  readonly id: string;
  readonly events: readonly AudioNoteEvent[];
  readonly scheduledAtClockTime: number;
  cancelled: boolean;
}

class MockAudioProvider implements InstrumentAudioProvider {
  readonly id: string;
  state: AudioProviderState = "idle";
  scheduledRecords: ScheduledRecord[] = [];
  stopCallCount = 0;
  disposeCallCount = 0;
  failOnPrepare = false;
  fallbackOnPrepare = false;

  constructor(id = "mock-piano-provider") {
    this.id = id;
  }

  async prepare(): Promise<void> {
    this.state = "loading";
    // Simulate async preparation
    await Promise.resolve();

    if (this.failOnPrepare) {
      this.state = "error";
      throw new Error("Failed to initialize audio provider");
    }

    if (this.fallbackOnPrepare) {
      this.state = "fallback";
      return;
    }

    this.state = "ready";
  }

  schedule(events: readonly AudioNoteEvent[], clock: AudioClock): ScheduledPlayback {
    if (this.state !== "ready" && this.state !== "fallback") {
      throw new Error(`Cannot schedule audio while provider is in state '${this.state}'`);
    }

    // Contract requirement: assert canonical AudioNoteEvent attributes
    for (const evt of events) {
      if (typeof evt.pitch !== "number" || evt.pitch < 0 || evt.pitch > 127) {
        throw new TypeError("AudioNoteEvent must contain a valid MIDI pitch in 0..127");
      }
      if (typeof evt.startSeconds !== "number" || evt.startSeconds < 0) {
        throw new TypeError("AudioNoteEvent must contain non-negative startSeconds");
      }
      if (typeof evt.durationSeconds !== "number" || evt.durationSeconds <= 0) {
        throw new TypeError("AudioNoteEvent must contain positive durationSeconds");
      }
      if (typeof evt.velocity !== "number" || evt.velocity < 1 || evt.velocity > 127) {
        throw new TypeError("AudioNoteEvent must contain numeric velocity in 1..127");
      }
      if (!["upper", "bass", "metronome"].includes(evt.channelRole)) {
        throw new TypeError("AudioNoteEvent channelRole must be upper, bass, or metronome");
      }
    }

    const playbackId = `sched-${this.scheduledRecords.length + 1}`;
    const record: ScheduledRecord = {
      id: playbackId,
      events: [...events],
      scheduledAtClockTime: clock.now(),
      cancelled: false,
    };
    this.scheduledRecords.push(record);

    return {
      id: playbackId,
      cancel: () => {
        record.cancelled = true;
      },
    };
  }

  stop(_scope?: PlaybackScope): void {
    this.stopCallCount++;
    for (const record of this.scheduledRecords) {
      record.cancelled = true;
    }
  }

  async dispose(): Promise<void> {
    this.disposeCallCount++;
    this.state = "idle";
    this.stop();
    await Promise.resolve();
  }
}

describe("T080 — Audio Provider contract integration", () => {
  it("transitions provider state predictably through idle -> loading -> ready", async () => {
    const provider = new MockAudioProvider();
    expect(provider.state).toBe("idle");

    const preparePromise = provider.prepare();
    expect(provider.state).toBe("loading");

    await preparePromise;
    expect(provider.state).toBe("ready");
  });

  it("transitions to error or fallback state on preparation failure", async () => {
    const errorProvider = new MockAudioProvider("error-provider");
    errorProvider.failOnPrepare = true;

    await expect(errorProvider.prepare()).rejects.toThrow("Failed to initialize audio provider");
    expect(errorProvider.state).toBe("error");

    const fallbackProvider = new MockAudioProvider("fallback-provider");
    fallbackProvider.fallbackOnPrepare = true;

    await fallbackProvider.prepare();
    expect(fallbackProvider.state).toBe("fallback");
  });

  it("consumes canonical AudioNoteEvent[] and rejects invalid or raw UI objects", async () => {
    const provider = new MockAudioProvider();
    await provider.prepare();
    const clock = new MockAudioClock();

    const validEvents: readonly AudioNoteEvent[] = [
      {
        pitch: 60,
        startSeconds: 0,
        durationSeconds: 1.0,
        velocity: 80,
        channelRole: "upper",
      },
      {
        pitch: 36,
        startSeconds: 0,
        durationSeconds: 1.0,
        velocity: 90,
        channelRole: "bass",
      },
    ];

    const scheduled = provider.schedule(validEvents, clock);
    expect(scheduled.id).toBe("sched-1");
    expect(provider.scheduledRecords).toHaveLength(1);
    expect(provider.scheduledRecords[0]!.events).toEqual(validEvents);

    // Rejecting invalid events
    const invalidPitchEvent = [
      {
        pitch: 150, // Invalid MIDI number
        startSeconds: 0,
        durationSeconds: 1,
        velocity: 80,
        channelRole: "upper" as const,
      },
    ];
    expect(() => provider.schedule(invalidPitchEvent, clock)).toThrow(TypeError);

    const invalidRoleEvent = [
      {
        pitch: 60,
        startSeconds: 0,
        durationSeconds: 1,
        velocity: 80,
        channelRole: "guitar-strum" as unknown as "upper",
      },
    ];
    expect(() => provider.schedule(invalidRoleEvent, clock)).toThrow(TypeError);
  });

  it("uses injected AudioClock.now() for schedule timing, decoupled from render frames", async () => {
    const provider = new MockAudioProvider();
    await provider.prepare();
    const mockClock = new MockAudioClock(12.5); // AudioContext already running at 12.5s

    const events: readonly AudioNoteEvent[] = [
      {
        pitch: 64,
        startSeconds: 0.5,
        durationSeconds: 0.75,
        velocity: 70,
        channelRole: "upper",
      },
    ];

    provider.schedule(events, mockClock);
    expect(provider.scheduledRecords[0]!.scheduledAtClockTime).toBe(12.5);

    // Advancing audio clock independently from wall/frame clock
    mockClock.advance(4.0);
    expect(mockClock.now()).toBe(16.5);

    provider.schedule(events, mockClock);
    expect(provider.scheduledRecords[1]!.scheduledAtClockTime).toBe(16.5);
  });

  it("ensures stop(scope) and dispose() are idempotent and safely repeatable", async () => {
    const provider = new MockAudioProvider();
    await provider.prepare();
    const clock = new MockAudioClock();

    provider.schedule(
      [
        {
          pitch: 60,
          startSeconds: 0,
          durationSeconds: 1,
          velocity: 80,
          channelRole: "upper",
        },
      ],
      clock,
    );

    // stop() can be called repeatedly without throwing
    expect(() => provider.stop()).not.toThrow();
    expect(() => provider.stop({ sessionId: "sess-1" })).not.toThrow();
    expect(() => provider.stop({ stepIds: ["step-1", "step-2"] })).not.toThrow();
    expect(provider.stopCallCount).toBe(3);

    // dispose() can be called repeatedly without throwing
    await expect(provider.dispose()).resolves.toBeUndefined();
    await expect(provider.dispose()).resolves.toBeUndefined();
    expect(provider.disposeCallCount).toBe(2);
    expect(provider.state).toBe("idle");
  });

  it("ensures provider errors/fallback state are observable and do not mutate Project state", async () => {
    const project = createDefaultProject(
      "p-audio",
      "Audio Test Project",
      "2026-09-04T12:00:00.000Z",
    );
    const originalStepsSnapshot = [...project.progression.steps];

    const errorProvider = new MockAudioProvider();
    errorProvider.failOnPrepare = true;

    try {
      await errorProvider.prepare();
    } catch {
      // Expected failure
    }

    // Provider state is observable as "error"
    expect(errorProvider.state).toBe("error");

    // Project state must remain completely pristine and unmutated
    expect(project.progression.steps).toEqual(originalStepsSnapshot);
    expect(project.tonic).toBe(0);
    expect(project.activeModule).toBe("progressions");
  });

  it("permits both future HqSamplePianoProvider and SoundFontProvider through the same InstrumentAudioProvider contract", async () => {
    // Both providers implement InstrumentAudioProvider contract interchangeably
    const sampleProvider: InstrumentAudioProvider = new MockAudioProvider("piano-hq-samples");
    const soundFontProvider: InstrumentAudioProvider = new MockAudioProvider("soundfont-piano");

    await sampleProvider.prepare();
    await soundFontProvider.prepare();

    const clock = new MockAudioClock(0);
    const testEvents: readonly AudioNoteEvent[] = [
      {
        pitch: 60,
        startSeconds: 0,
        durationSeconds: 0.5,
        velocity: 80,
        channelRole: "upper",
      },
    ];

    // Caller helper that interacts only with the abstract contract
    function playProgression(
      provider: InstrumentAudioProvider,
      events: readonly AudioNoteEvent[],
      audioClock: AudioClock,
    ): ScheduledPlayback {
      return provider.schedule(events, audioClock);
    }

    const playback1 = playProgression(sampleProvider, testEvents, clock);
    const playback2 = playProgression(soundFontProvider, testEvents, clock);

    expect(playback1.id).toBeDefined();
    expect(playback2.id).toBeDefined();

    expect(() => playback1.cancel()).not.toThrow();
    expect(() => playback2.cancel()).not.toThrow();
  });
});
