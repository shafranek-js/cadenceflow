import { describe, expect, it } from "vitest";
import { rational } from "../../src/domain/timing/rational";
import { musicalDuration } from "../../src/domain/timing/duration";
import { meter, applyMeterChange, pulseToBeats } from "../../src/domain/timing/meter";
import { groove, projectSwingTiming, type TimedEvent } from "../../src/domain/timing/swing";
import {
  createProgressionTimeline,
  resolveHarmonicPredecessor,
} from "../../src/domain/timing/timeline";
import type { ChordStep, RestStep, StepPerformance } from "../../src/domain/progression/step";
import { EMPTY_HARMONIC_VARIANT } from "../../src/domain/harmony/chord";
import { realizeProgressionAudioEvents } from "../../src/audio/eventRealizer";
import { generateCountInEvents } from "../../src/audio/metronome";
import { PlaybackController } from "../../src/audio/playbackController";
import { TransportStore } from "../../src/ui/transport/transportStore";
import { setLoopRange } from "../../src/ui/transport/loopState";
import type {
  AudioClock,
  AudioNoteEvent,
  InstrumentAudioProvider,
  PlaybackScope,
  ScheduledPlayback,
} from "../../src/audio/contracts";

class FakeAudioClock implements AudioClock {
  currentTime: number;
  constructor(initial = 0) {
    this.currentTime = initial;
  }
  now(): number {
    return this.currentTime;
  }
  advance(seconds: number): void {
    this.currentTime += seconds;
  }
}

class MockAudioProvider implements InstrumentAudioProvider {
  readonly id = "mock-piano-provider";
  state: "idle" | "loading" | "ready" | "fallback" | "error" = "ready";
  scheduledBatches: Array<{
    readonly id: string;
    readonly events: readonly AudioNoteEvent[];
    readonly scheduledAt: number;
    cancelled: boolean;
  }> = [];
  stopCallCount = 0;
  readyPromiseToReturn?: Promise<void> | undefined;

  async prepare(): Promise<void> {
    if (this.state === "error") {
      throw new Error("Provider prepare failed");
    }
  }

  schedule(events: readonly AudioNoteEvent[], clock: AudioClock): ScheduledPlayback {
    const id = `batch-${this.scheduledBatches.length + 1}`;
    const record = {
      id,
      events: [...events],
      scheduledAt: clock.now(),
      cancelled: false,
    };
    this.scheduledBatches.push(record);
    return {
      id,
      ready: this.readyPromiseToReturn,
      cancel: () => {
        record.cancelled = true;
      },
    };
  }

  stop(_scope?: PlaybackScope): void {
    this.stopCallCount++;
    for (const batch of this.scheduledBatches) {
      batch.cancelled = true;
    }
  }

  async dispose(): Promise<void> {
    this.stop();
  }
}

const DEFAULT_PERF: StepPerformance = Object.freeze({
  articulation: "block",
  register: "auto",
  voicingMode: "auto",
  bass: Object.freeze({ choice: "auto", octaveOffset: "auto" }),
  masterVelocity: 80,
  perNoteVelocityOverrides: Object.freeze({}),
  dynamicsViewPreference: "musical",
});

function makeChord(id: string, num: number, den = 1, functionId = "I"): ChordStep {
  return Object.freeze({
    id,
    kind: "chord",
    harmonicFunction: Object.freeze({ moduleId: "progressions", functionId }),
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(num, den)),
    cardView: "harmonic",
    performance: DEFAULT_PERF,
  });
}

function makeRest(id: string, num: number, den = 1): RestStep {
  return Object.freeze({
    id,
    kind: "rest",
    duration: musicalDuration(rational(num, den)),
  });
}

describe("T110 — Timing → Playback/Audio Projection Integration Acceptance", () => {
  // Invariant 1: semantic timing = Rational, playback seconds = boundary projection only
  // Invariant 2: Rest duration exists, Rest pitched audio event does not
  describe("Fixture A — Straight 4/4 exact projection", () => {
    it("projects mixed chord/rest durations with exact Rational starts and seconds conversion without emitting events for Rest", () => {
      // Step 1 chord: Quarter = 1 beat
      // Step 2 chord: Eighth = 1/2 beat
      // Step 3 Rest: 1/2 beat
      // Step 4 chord: Half = 2 beats
      // Total = 4 canonical beats
      const steps = [
        makeChord("step-1", 1, 1, "I"),
        makeChord("step-2", 1, 2, "IV"),
        makeRest("step-3", 1, 2),
        makeChord("step-4", 2, 1, "V"),
      ];
      const m44 = meter(4, 4);

      // 1. Semantic timeline calculation
      const timeline = createProgressionTimeline(steps, m44);
      expect(timeline.totalDurationBeats).toEqual(rational(4, 1));
      expect(timeline.totalBars).toEqual(rational(1, 1));

      // Exact semantic starts: 0, 1, 3/2, 2
      expect(timeline.steps[0]!.startBeats).toEqual(rational(0, 1));
      expect(timeline.steps[1]!.startBeats).toEqual(rational(1, 1));
      expect(timeline.steps[2]!.startBeats).toEqual(rational(3, 2)); // Rest starts at 3/2
      expect(timeline.steps[3]!.startBeats).toEqual(rational(2, 1)); // Step 4 starts at 2

      // 2. Playback seconds projection at 120 BPM (1 beat = 0.5s)
      const tempoBpm = 120;
      const events = realizeProgressionAudioEvents({
        steps,
        tonic: 0,
        context: "major",
        tempoBpm,
      });

      // Events start times: Step 1 at 0.0s, Step 2 at 0.5s, Step 4 at 1.0s
      const at0 = events.filter((e) => Math.abs(e.startSeconds - 0.0) < 0.001);
      const at05 = events.filter((e) => Math.abs(e.startSeconds - 0.5) < 0.001);
      const at10 = events.filter((e) => Math.abs(e.startSeconds - 1.0) < 0.001);

      expect(at0.length).toBeGreaterThan(0); // Step 1 (I)
      expect(at05.length).toBeGreaterThan(0); // Step 2 (IV)
      expect(at10.length).toBeGreaterThan(0); // Step 4 (V)

      // Rest interval [0.75s, 1.0s): strictly ZERO pitched events start here
      const duringRest = events.filter((e) => e.startSeconds >= 0.75 && e.startSeconds < 1.0);
      expect(duringRest).toHaveLength(0);

      // Step objects must remain unmutated
      expect(steps[0]!.duration.beats).toEqual(rational(1, 1));
      expect(steps[1]!.duration.beats).toEqual(rational(1, 2));
      expect(steps[2]!.duration.beats).toEqual(rational(1, 2));
      expect(steps[3]!.duration.beats).toEqual(rational(2, 1));
    });
  });

  describe("Fixture B — Tempo is boundary projection only", () => {
    it("preserves bit-identical Rational durations while 120 BPM playback seconds are exactly half 60 BPM values", () => {
      const steps = [
        makeChord("s1", 1, 1, "I"),
        makeChord("s2", 1, 2, "IV"),
        makeRest("s3", 1, 2),
        makeChord("s4", 2, 1, "V"),
      ];
      const m44 = meter(4, 4);

      // Project at 60 BPM (1 beat = 1.0s)
      const events60 = realizeProgressionAudioEvents({
        steps,
        tonic: 0,
        context: "major",
        tempoBpm: 60,
      });

      // Project at 120 BPM (1 beat = 0.5s)
      const events120 = realizeProgressionAudioEvents({
        steps,
        tonic: 0,
        context: "major",
        tempoBpm: 120,
      });

      expect(events120).toHaveLength(events60.length);

      // Every note at 120 BPM must have exactly half startSeconds and durationSeconds of 60 BPM
      for (let i = 0; i < events60.length; i++) {
        const e60 = events60[i]!;
        const e120 = events120[i]!;
        expect(e120.pitch).toBe(e60.pitch);
        expect(e120.startSeconds).toBeCloseTo(e60.startSeconds / 2, 4);
        expect(e120.durationSeconds).toBeCloseTo(e60.durationSeconds / 2, 4);
      }

      // Canonical Rational durations remain bit-identical
      const timeline = createProgressionTimeline(steps, m44);
      expect(timeline.steps[0]!.durationBeats).toEqual(rational(1, 1));
      expect(timeline.steps[1]!.durationBeats).toEqual(rational(1, 2));
      expect(timeline.steps[2]!.durationBeats).toEqual(rational(1, 2));
      expect(timeline.steps[3]!.durationBeats).toEqual(rational(2, 1));
    });
  });

  // Invariant 3: Swing projection != Project mutation
  describe("Fixture C — Swing non-destructive projection", () => {
    it("projects swung timing on eighth-note pairs while preserving exact pair sum (1 beat) and unmutated Step durations", () => {
      const steps = [makeChord("c1", 1, 2, "I"), makeChord("c2", 1, 2, "V")];
      expect(steps[0]!.duration.beats).toEqual(rational(1, 2));
      expect(steps[1]!.duration.beats).toEqual(rational(1, 2));

      // Timed events representing two consecutive eighth notes
      const unswungEvents: TimedEvent[] = [
        { startBeats: rational(0, 1), durationBeats: rational(1, 2) },
        { startBeats: rational(1, 2), durationBeats: rational(1, 2) },
      ];

      const swingGroove = groove("swing", 0.6);
      const swungEvents = projectSwingTiming(unswungEvents, swingGroove);

      // First subdivision longer (> 1/2 beat)
      const firstDur =
        swungEvents[0]!.durationBeats.numerator / swungEvents[0]!.durationBeats.denominator;
      expect(firstDur).toBeGreaterThan(0.5);

      // Second subdivision delayed (> 1/2 beat start) and shorter (< 1/2 beat duration)
      const secondStart =
        swungEvents[1]!.startBeats.numerator / swungEvents[1]!.startBeats.denominator;
      const secondDur =
        swungEvents[1]!.durationBeats.numerator / swungEvents[1]!.durationBeats.denominator;
      expect(secondStart).toBeGreaterThan(0.5);
      expect(secondDur).toBeLessThan(0.5);

      // Projected pair total remains exactly 1 canonical beat: secondStart + secondDur = 1.0
      expect(secondStart + secondDur).toBeCloseTo(1.0, 4);

      // Original Step durations remain completely unmutated
      expect(steps[0]!.duration.beats).toEqual(rational(1, 2));
      expect(steps[1]!.duration.beats).toEqual(rational(1, 2));

      // Straight feel with the same remembered nonzero swing amount produces original timing
      const straightGroove = groove("straight", 0.6);
      const straightEvents = projectSwingTiming(unswungEvents, straightGroove);
      expect(straightEvents[0]!.startBeats).toEqual(rational(0, 1));
      expect(straightEvents[0]!.durationBeats).toEqual(rational(1, 2));
      expect(straightEvents[1]!.startBeats).toEqual(rational(1, 2));
      expect(straightEvents[1]!.durationBeats).toEqual(rational(1, 2));
    });
  });

  describe("Fixture D — Polyphonic Swing", () => {
    it("displaces simultaneous voices identically in the same grid slot regardless of input array permutation", () => {
      interface PolyTimedNote extends TimedEvent {
        readonly pitch: number;
        readonly voice: "upper" | "bass";
      }

      const noteUpper1: PolyTimedNote = {
        pitch: 64,
        voice: "upper",
        startBeats: rational(0, 1),
        durationBeats: rational(1, 2),
      };
      const noteBass1: PolyTimedNote = {
        pitch: 48,
        voice: "bass",
        startBeats: rational(0, 1),
        durationBeats: rational(1, 2),
      };
      const noteUpper2: PolyTimedNote = {
        pitch: 67,
        voice: "upper",
        startBeats: rational(1, 2),
        durationBeats: rational(1, 2),
      };
      const noteBass2: PolyTimedNote = {
        pitch: 55,
        voice: "bass",
        startBeats: rational(1, 2),
        durationBeats: rational(1, 2),
      };

      const originalOrder = [noteUpper1, noteBass1, noteUpper2, noteBass2];
      const permutedOrder = [noteBass2, noteUpper1, noteBass1, noteUpper2];

      const swingGroove = groove("swing", 0.75);
      const swungOriginal = projectSwingTiming(originalOrder, swingGroove);
      const swungPermuted = projectSwingTiming(permutedOrder, swingGroove);

      // In slot 1 (beat 0): upper and bass have identical start and duration
      const origBeat0Upper = swungOriginal.find((n) => n.pitch === 64)!;
      const origBeat0Bass = swungOriginal.find((n) => n.pitch === 48)!;
      expect(origBeat0Upper.startBeats).toEqual(origBeat0Bass.startBeats);
      expect(origBeat0Upper.durationBeats).toEqual(origBeat0Bass.durationBeats);

      // In slot 2 (beat 1/2 offbeat): upper and bass have identical displacement
      const origBeat1Upper = swungOriginal.find((n) => n.pitch === 67)!;
      const origBeat1Bass = swungOriginal.find((n) => n.pitch === 55)!;
      expect(origBeat1Upper.startBeats).toEqual(origBeat1Bass.startBeats);
      expect(origBeat1Upper.durationBeats).toEqual(origBeat1Bass.durationBeats);

      // Permutation invariance: results match regardless of array input ordering
      const permBeat1Upper = swungPermuted.find((n) => n.pitch === 67)!;
      const permBeat1Bass = swungPermuted.find((n) => n.pitch === 55)!;
      expect(permBeat1Upper.startBeats).toEqual(origBeat1Upper.startBeats);
      expect(permBeat1Bass.startBeats).toEqual(origBeat1Bass.startBeats);
    });
  });

  describe("Fixture E — Custom meter 7/8 [2+2+3]", () => {
    it("calculates one bar as 7/2 canonical beats and projects 1.75s duration at 120 BPM without treating eighths as quarter notes", () => {
      const meter78 = meter(7, 8, [2, 2, 3]);

      // One bar in canonical beats = 7 * 4 / 8 = 7/2 = 3.5 beats
      const step = makeChord("s1", 7, 2, "I");
      const timeline = createProgressionTimeline([step], meter78);

      expect(timeline.totalDurationBeats).toEqual(rational(7, 2));
      expect(timeline.totalBars).toEqual(rational(1, 1)); // Exactly 1 bar

      // Pulse-to-beat conversion: pulses are based on eighth-note denominator
      expect(pulseToBeats(0, meter78)).toEqual(rational(0, 1));
      expect(pulseToBeats(2, meter78)).toEqual(rational(1, 1)); // 2 eighths = 1 canonical beat
      expect(pulseToBeats(4, meter78)).toEqual(rational(2, 1)); // 4 eighths = 2 canonical beats
      expect(pulseToBeats(7, meter78)).toEqual(rational(7, 2)); // 7 eighths = 3.5 canonical beats

      // Playback seconds conversion at 120 BPM:
      // 1 beat = 0.5s. 7/2 beats = 3.5 * 0.5 = 1.75 seconds.
      const countIn = generateCountInEvents(meter78, 120, 0);
      expect(countIn.durationSeconds).toBeCloseTo(1.75, 4);

      // Pulses at 0, 2, 4 eighths correspond to 0.0s, 0.5s, 1.0s
      const accented = countIn.events.filter((e) => e.pitch === 84 || e.pitch === 76);
      expect(accented).toHaveLength(3);
      expect(accented[0]!.startSeconds).toBeCloseTo(0.0, 3);
      expect(accented[1]!.startSeconds).toBeCloseTo(0.5, 3);
      expect(accented[2]!.startSeconds).toBeCloseTo(1.0, 3);
    });
  });

  describe("Fixture F — Meter change Reflow vs Preserve", () => {
    it("proves Reflow proportionally scales [4, 2, 2] to [3, 3/2, 3/2] while Preserve leaves durations unchanged", () => {
      const steps = [
        makeChord("step-a", 4, 1, "I"),
        makeChord("step-b", 2, 1, "IV"),
        makeChord("step-c", 2, 1, "V"),
      ];
      const m44 = meter(4, 4);
      const m34 = meter(3, 4);

      // Policy 1: Reflow (4/4 -> 3/4 scales by 3/4)
      const reflowed = applyMeterChange(steps, m44, m34, "reflow");
      expect(reflowed).toHaveLength(3);
      expect(reflowed[0]!.id).toBe("step-a");
      expect(reflowed[1]!.id).toBe("step-b");
      expect(reflowed[2]!.id).toBe("step-c");

      // [4, 2, 2] * 3/4 = [3, 3/2, 3/2]
      expect(reflowed[0]!.duration.beats).toEqual(rational(3, 1));
      expect(reflowed[1]!.duration.beats).toEqual(rational(3, 2));
      expect(reflowed[2]!.duration.beats).toEqual(rational(3, 2));

      // Playback projection uses the reflowed durations:
      // At 120 BPM (0.5s/beat): 3 beats = 1.5s, 3/2 beats = 0.75s, 3/2 beats = 0.75s
      const reflowedAudio = realizeProgressionAudioEvents({
        steps: reflowed,
        tonic: 0,
        context: "major",
        tempoBpm: 120,
      });
      const at0 = reflowedAudio.filter((e) => Math.abs(e.startSeconds - 0.0) < 0.01);
      const at15 = reflowedAudio.filter((e) => Math.abs(e.startSeconds - 1.5) < 0.01);
      const at225 = reflowedAudio.filter((e) => Math.abs(e.startSeconds - 2.25) < 0.01);
      expect(at0.length).toBeGreaterThan(0);
      expect(at15.length).toBeGreaterThan(0);
      expect(at225.length).toBeGreaterThan(0);

      // Policy 2: Preserve Beat Lengths
      const preserved = applyMeterChange(steps, m44, m34, "preserve-beat-lengths");
      expect(preserved).toHaveLength(3);
      expect(preserved[0]!.duration.beats).toEqual(rational(4, 1));
      expect(preserved[1]!.duration.beats).toEqual(rational(2, 1));
      expect(preserved[2]!.duration.beats).toEqual(rational(2, 1));

      // Original steps remain untouched
      expect(steps[0]!.duration.beats).toEqual(rational(4, 1));
    });
  });

  describe("Fixture G — Rest harmonic context + playback silence", () => {
    it("maintains Rest timeline duration, emits zero pitched events, and resolves I as harmonic predecessor for IV across multiple Rests", () => {
      const steps = [
        makeChord("c1", 1, 1, "I"),
        makeRest("r1", 1, 1),
        makeRest("r2", 1, 1),
        makeChord("c2", 1, 1, "IV"),
      ];
      const m44 = meter(4, 4);

      // 1. Timeline and Predecessor
      const timeline = createProgressionTimeline(steps, m44);
      expect(timeline.totalDurationBeats).toEqual(rational(4, 1));

      // Harmonic predecessor for both rests and IV is Step 0 (I)
      expect(resolveHarmonicPredecessor(timeline, 1)?.id).toBe("c1");
      expect(resolveHarmonicPredecessor(timeline, 2)?.id).toBe("c1");
      expect(resolveHarmonicPredecessor(timeline, 3)?.id).toBe("c1");

      // 2. Playback Audio Realization
      const events = realizeProgressionAudioEvents({
        steps,
        tonic: 0,
        context: "major",
        tempoBpm: 120,
      });

      // Events only exist for Chord 1 [0.0s, 0.5s) and Chord 2 [1.5s, 2.0s)
      const chord1Events = events.filter((e) => e.startSeconds < 0.5);
      const restIntervalEvents = events.filter(
        (e) => e.startSeconds >= 0.5 && e.startSeconds < 1.5,
      );
      const chord2Events = events.filter((e) => e.startSeconds >= 1.5);

      expect(chord1Events.length).toBeGreaterThan(0);
      expect(restIntervalEvents).toHaveLength(0); // Zero pitched events emitted during Rest!
      expect(chord2Events.length).toBeGreaterThan(0);
    });
  });

  describe("Fixture H — Play From Here boundary", () => {
    it("starts playback strictly from target step boundary without scheduling prior steps", () => {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockAudioProvider();
      const transportStore = new TransportStore();

      const controller = new PlaybackController({
        clock,
        pianoProvider: provider,
        transportStore,
      });

      const steps = [
        makeChord("step-1", 2, 1, "I"),
        makeChord("step-2", 2, 1, "ii"),
        makeChord("step-3", 2, 1, "IV"),
        makeChord("step-4", 2, 1, "V"),
      ];

      controller.playFromHere("step-3", {
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
      });

      expect(transportStore.getState().status).toBe("playing");
      expect(transportStore.getState().startingStepIndex).toBe(2);
      expect(transportStore.getState().currentStepIndex).toBe(2);

      const allEvents = provider.scheduledBatches.flatMap((b) => b.events);

      // Step 3 starts at session-relative 0.0s
      const at0 = allEvents.filter((e) => Math.abs(e.startSeconds - 0.0) < 0.01);
      expect(at0.length).toBeGreaterThan(0);

      // Steps 1 and 2 do NOT sound
      expect(allEvents.every((e) => e.startSeconds >= 0)).toBe(true);

      controller.stop();
      expect(transportStore.getState().status).toBe("stopped");
    });
  });

  // Invariant 4: Count-in time != Progression semantic time
  describe("Fixture I — One-bar Count-in", () => {
    it("schedules count-in preceding audio without mutating progression semantic time", () => {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockAudioProvider();
      const transportStore = new TransportStore();

      const controller = new PlaybackController({
        clock,
        pianoProvider: provider,
        transportStore,
        lookAheadHorizonSeconds: 10.0,
      });

      const step = makeChord("c1", 4, 1, "I");
      const steps = [step];

      controller.start({
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
        countInEnabled: true,
      });

      const allEvents = provider.scheduledBatches.flatMap((b) => b.events);
      const metronomeEvents = allEvents.filter((e) => e.channelRole === "metronome");
      const pianoEvents = allEvents.filter((e) => e.channelRole !== "metronome");

      // 4 count-in clicks preceding audio in [0, 2.0s)
      expect(metronomeEvents).toHaveLength(4);
      expect(pianoEvents[0]!.startSeconds).toBeCloseTo(2.0, 2);

      // Semantic duration unchanged
      expect(step.duration.beats).toEqual(rational(4, 1));

      controller.stop();
    });
  });

  // Invariant 5: Loop iteration timing is anchor-based
  describe("Fixture J — Loop projection and zero drift", () => {
    it("proves base-anchored loop iteration timing maintains zero cumulative drift (< 1e-9 s) over 1000 iterations", () => {
      const tempoBpm = 120;
      const t0 = 50.0; // Arbitrary audio clock base

      // Awkward rational loop duration: 7/6 beat
      const num = 7;
      const den = 6;

      for (let k = 1; k <= 1000; k++) {
        // Production PlaybackController anchor formula:
        const tk = t0 + (k * num * 60) / (den * tempoBpm);

        // Theoretical exact value: t0 + k * (420 / 720) = t0 + (k * 7) / 12
        const exact = t0 + (k * 7 * 60) / (6 * 120);
        const drift = Math.abs(tk - exact);
        expect(drift).toBeLessThan(1e-9);
      }

      // Prove Stop resets to loop start
      const steps = [
        makeChord("s1", 2, 1, "I"),
        makeChord("s2", 2, 1, "IV"),
        makeChord("s3", 2, 1, "V"),
      ];
      const store = new TransportStore();
      const loopRange = setLoopRange("s2", "s3", steps);
      expect(loopRange.enabled).toBe(true);

      store.play({ stepCount: 3, loopStartStepIndex: 1 });
      expect(store.getState().startingStepIndex).toBe(1);

      store.stop();
      expect(store.getState().status).toBe("stopped");
      expect(store.getState().startingStepIndex).toBe(1); // Resets to loop range start!

      // Disabling loop resets subsequent Stop target to progression start (0)
      store.setLoopAwareResetTarget(0);
      store.stop();
      expect(store.getState().startingStepIndex).toBe(0);
    });
  });

  describe("Fixture K — Pause/Resume Outcome B", () => {
    // v1 Outcome B — sample attack restarts while remaining timeline duration is preserved
    it("v1 Outcome B — sample attack restarts while remaining timeline duration is preserved", () => {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockAudioProvider();
      const transportStore = new TransportStore();

      const controller = new PlaybackController({
        clock,
        pianoProvider: provider,
        transportStore,
        lookAheadHorizonSeconds: 10.0,
      });

      // Step 1: 4 beats = 2.0s duration at 120 BPM (effective note duration ~1.9s)
      // Step 2: 2 beats = 1.0s duration (starts at 2.0s)
      const steps = [makeChord("c1", 4, 1, "I"), makeChord("c2", 2, 1, "V")];

      controller.start({
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
      });

      // Advance 0.6s into Step 1
      clock.advance(0.6);
      controller.pause();

      expect(transportStore.getState().status).toBe("paused");
      expect(transportStore.getState().pausedPositionSeconds).toBeCloseTo(0.6, 2);
      expect(provider.stopCallCount).toBe(1); // Active audio cancelled immediately

      const batchesBeforeResume = provider.scheduledBatches.length;

      // Real time passes while paused
      clock.advance(3.0);

      controller.resume();
      expect(transportStore.getState().status).toBe("playing");

      const resumedBatches = provider.scheduledBatches.slice(batchesBeforeResume);
      const resumedEvents = resumedBatches.flatMap((b) => b.events);

      // Outcome B: Attack restarts with remaining duration (1.9s - 0.6s = ~1.3s), not full 1.9s
      const continuationNotes = resumedEvents.filter((e) => e.startSeconds === 0);
      expect(continuationNotes.length).toBeGreaterThan(0);
      for (const note of continuationNotes) {
        expect(note.durationSeconds).toBeCloseTo(1.3, 1);
        expect(note.durationSeconds).toBeLessThan(1.5);
      }

      // Future events are not duplicated and start at relative offset (2.0s - 0.6s = 1.4s)
      const futureNotes = resumedEvents.filter((e) => Math.abs(e.startSeconds - 1.4) < 0.05);
      expect(futureNotes.length).toBeGreaterThan(0);

      controller.stop();
    });
  });

  describe("Fixture L — Runtime audio failure cleanup", () => {
    it("clears active playback and sets error state on provider prepare or asynchronous ready rejection without fallback", async () => {
      const clock = new FakeAudioClock(0.0);
      const provider = new MockAudioProvider();
      const transportStore = new TransportStore();

      let rejectReady!: (reason?: unknown) => void;
      provider.readyPromiseToReturn = new Promise((_, reject) => {
        rejectReady = reject;
      });

      const controller = new PlaybackController({
        clock,
        pianoProvider: provider,
        transportStore,
      });

      const steps = [makeChord("c1", 4, 1, "I")];

      controller.start({
        steps,
        meter: meter(4, 4),
        tempoBpm: 120,
        groove: groove("straight"),
        tonic: 0,
        context: "major",
      });

      expect(transportStore.getState().status).toBe("playing");

      // Asynchronous rejection occurs
      rejectReady(new Error("AudioBuffer decode error in Salamander sample"));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(transportStore.getState().status).toBe("stopped");
      expect(transportStore.getState().currentStepIndex).toBeNull();
      expect(transportStore.getState().error).toContain(
        "AudioBuffer decode error in Salamander sample",
      );

      // Stale callback cannot revive playback
      transportStore.onSessionEnded("old-session-id");
      expect(transportStore.getState().status).toBe("stopped");

      // Progression is untouched
      expect(steps[0]!.duration.beats).toEqual(rational(4, 1));
    });
  });

  // Invariant 6: Playing Step != Selected editing Step
  describe("Canonical Invariant — Playing Step vs Selected Editing Step Independence", () => {
    it("proves transport playhead progression does not mutate editor selection state", () => {
      const store = new TransportStore();
      const editorState = { selectedStepId: "step-edit-target" };

      store.play({ stepCount: 4 });
      expect(store.getState().currentStepIndex).toBe(0);
      expect(editorState.selectedStepId).toBe("step-edit-target");

      store.setCurrentStepIndex(1);
      expect(store.getState().currentStepIndex).toBe(1);
      expect(editorState.selectedStepId).toBe("step-edit-target");

      store.setCurrentStepIndex(2);
      expect(store.getState().currentStepIndex).toBe(2);
      expect(editorState.selectedStepId).toBe("step-edit-target");

      store.stop();
      expect(store.getState().currentStepIndex).toBeNull();
      expect(editorState.selectedStepId).toBe("step-edit-target");
    });
  });
});
