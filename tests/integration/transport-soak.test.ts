import { describe, expect, it, vi } from "vitest";
import type {
  AudioClock,
  AudioNoteEvent,
  InstrumentAudioProvider,
  PlaybackScope,
  ScheduledPlayback,
} from "../../src/audio/contracts";
/** `PlaybackController.start` needs a full `HarmonicContext`; this used to pass the string "major". */
const C_MAJOR_CONTEXT: HarmonicContext = Object.freeze<HarmonicContext>({
  tonic: 0,
  moduleId: "progressions",
  mode: "major",
  spellingContext: Object.freeze({ tonic: 0, mode: "major" }),
});
import { PlaybackController } from "../../src/audio/playbackController";
import { LookAheadScheduler } from "../../src/audio/scheduler";
import { TransportStore } from "../../src/ui/transport/transportStore";
import { setLoopMode, INITIAL_LOOP_STATE } from "../../src/ui/transport/loopState";
import { createMatrixChordStep } from "../../src/app/commands/matrixCommands";
import { createDefaultProject } from "../../src/domain/project/factory";
import type { HarmonicContext } from "../../src/domain/harmony/modules/types";
import { musicalDuration } from "../../src/domain/timing/duration";
import { meter } from "../../src/domain/timing/meter";
import { rational } from "../../src/domain/timing/rational";
import { groove } from "../../src/domain/timing/swing";
import type { ProgressionStep } from "../../src/domain/progression/step";

class VirtualAudioClock implements AudioClock {
  constructor(public currentTime = 0) {}

  now(): number {
    return this.currentTime;
  }

  advance(seconds: number): void {
    this.currentTime += seconds;
  }
}

interface ScheduledBatch {
  readonly scheduledAt: number;
  readonly events: readonly AudioNoteEvent[];
  cancelled: boolean;
}

class RecordingProvider implements InstrumentAudioProvider {
  readonly id = "t152-recording-provider";
  readonly state = "ready" as const;
  readonly batches: ScheduledBatch[] = [];

  async prepare(): Promise<void> {}

  schedule(events: readonly AudioNoteEvent[], clock: AudioClock): ScheduledPlayback {
    const batch: ScheduledBatch = {
      scheduledAt: clock.now(),
      events: [...events],
      cancelled: false,
    };
    this.batches.push(batch);
    return {
      id: `t152-batch-${this.batches.length}`,
      cancel: () => {
        batch.cancelled = true;
      },
    };
  }

  stop(_scope?: PlaybackScope): void {
    for (const batch of this.batches) batch.cancelled = true;
  }

  async dispose(): Promise<void> {
    this.stop();
  }
}

function makeSoakStep(
  project: ReturnType<typeof createDefaultProject>,
  functionId: string,
  id: string,
  numerator: number,
  denominator: number,
): ProgressionStep {
  const step = createMatrixChordStep(project, functionId, id);
  return Object.freeze<ProgressionStep>({
    ...step,
    duration: musicalDuration(rational(numerator, denominator)),
  });
}

describe("T152 — virtual-clock transport and loop soak", () => {
  it("keeps long-progression scheduler targets anchored without duplicate events", () => {
    vi.useFakeTimers();
    const clock = new VirtualAudioClock(12.5);
    const provider = new RecordingProvider();
    const scheduledTargets: number[] = [];
    const onEnded = vi.fn();
    const eventCount = 1024;
    const eventSpacingSeconds = 7 / 53;
    const eventDurationSeconds = 5 / 53;
    const playbackDurationSeconds = (eventCount - 1) * eventSpacingSeconds + eventDurationSeconds;
    const scheduler = new LookAheadScheduler({
      clock,
      provider,
      lookAheadHorizonSeconds: 0.12,
      tickIntervalMs: 25,
      onEventScheduled: (_event, targetAudioTime) => scheduledTargets.push(targetAudioTime),
      onPlaybackEnded: onEnded,
    });
    const events = Object.freeze(
      Array.from({ length: eventCount }, (_, index) => ({
        pitch: 48 + (index % 36),
        startSeconds: index * eventSpacingSeconds,
        durationSeconds: eventDurationSeconds,
        velocity: 80,
        channelRole: "upper" as const,
        eventIndex: index,
      })),
    );

    try {
      scheduler.start(events, clock.now(), 0, playbackDurationSeconds);
      const finalAudioTime = clock.now() + playbackDurationSeconds;
      let manualTicks = 0;
      while (clock.now() < finalAudioTime + 0.2) {
        clock.advance(0.05);
        scheduler.tick();
        manualTicks++;
        if (manualTicks > 4000) throw new Error("virtual soak did not converge");
      }
      scheduler.tick();

      expect(scheduledTargets).toHaveLength(eventCount);
      expect(provider.batches.flatMap((batch) => batch.events)).toHaveLength(eventCount);
      expect(
        provider.batches.flatMap((batch) => batch.events.map((event) => event.eventIndex)),
      ).toHaveLength(
        new Set(provider.batches.flatMap((batch) => batch.events.map((event) => event.eventIndex)))
          .size,
      );
      expect(onEnded).toHaveBeenCalledTimes(1);
      expect(scheduler.currentState).toBe("idle");

      const maxTargetError = scheduledTargets.reduce(
        (maxError, target, index) =>
          Math.max(maxError, Math.abs(target - (12.5 + index * eventSpacingSeconds))),
        0,
      );
      console.log(
        `[T152] ${eventCount} events over ${playbackDurationSeconds.toFixed(3)}s virtual time, ` +
          `${manualTicks} manual ticks, max target drift=${maxTargetError.toExponential(3)}s`,
      );
      expect(maxTargetError).toBeLessThan(1e-12);
    } finally {
      scheduler.dispose();
      vi.useRealTimers();
    }
  });

  it("keeps loop boundaries base-anchored across a long virtual loop run", () => {
    vi.useFakeTimers();
    const startAudioTime = 100;
    const clock = new VirtualAudioClock(startAudioTime);
    const provider = new RecordingProvider();
    const transportStore = new TransportStore();
    const project = createDefaultProject(
      "t152-loop",
      "T152 loop fixture",
      "2026-09-13T10:00:00.000Z",
    );
    const steps = Object.freeze([
      makeSoakStep(project, "I", "loop-1", 7, 6),
      makeSoakStep(project, "IV", "loop-2", 1, 3),
      makeSoakStep(project, "V", "loop-3", 2, 1),
    ]);
    const loopState = setLoopMode(INITIAL_LOOP_STATE, "all", steps);
    const controller = new PlaybackController({
      clock,
      pianoProvider: provider,
      transportStore,
      lookAheadHorizonSeconds: 0.1,
      tickIntervalMs: 25,
    });
    const loopDurationSeconds = (7 / 2) * (60 / 120);
    const loopCount = 240;
    const tickSeconds = 0.025;
    const firstStepBoundarySchedules: number[] = [];

    const originalSchedule = provider.schedule.bind(provider);
    provider.schedule = (events, scheduleClock) => {
      for (const event of events) {
        if (event.stepIndex === 0 && event.channelRole === "bass") {
          firstStepBoundarySchedules.push(scheduleClock.now() + event.startSeconds);
        }
      }
      return originalSchedule(events, scheduleClock);
    };

    try {
      expect(
        controller.start({
          steps,
          meter: meter(7, 8, [2, 2, 3]),
          tempoBpm: 120,
          groove: groove("straight"),
          tonic: 0,
          context: C_MAJOR_CONTEXT,
          loopState,
        }),
      ).toBe(true);

      const maxTicks = loopCount * Math.ceil(loopDurationSeconds / tickSeconds) + loopCount + 100;
      for (
        let tick = 0;
        tick < maxTicks && firstStepBoundarySchedules.length < loopCount + 1;
        tick++
      ) {
        clock.advance(tickSeconds);
        vi.advanceTimersByTime(25);
      }

      expect(firstStepBoundarySchedules).toHaveLength(loopCount + 1);
      expect(transportStore.getState().status).toBe("playing");
      expect(transportStore.getState().error).toBeNull();

      const boundaryDrifts = firstStepBoundarySchedules.map((actual, iteration) =>
        Math.abs(actual - (startAudioTime + iteration * loopDurationSeconds)),
      );
      const maxBoundaryDrift = Math.max(...boundaryDrifts);
      console.log(
        `[T152] ${loopCount} loop iterations at ${loopDurationSeconds.toFixed(3)}s, ` +
          `max boundary drift=${maxBoundaryDrift.toExponential(3)}s`,
      );
      expect(maxBoundaryDrift).toBeLessThanOrEqual(tickSeconds + 1e-9);
      expect(boundaryDrifts.at(-1)).toBeLessThanOrEqual(tickSeconds + 1e-9);
    } finally {
      controller.stop();
      vi.useRealTimers();
    }
  });
});
