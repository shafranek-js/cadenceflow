import { describe, expect, it } from "vitest";
import {
  realizeProgressionAudioEvents,
  realizeStepAudioEvents,
} from "../../../src/audio/eventRealizer";
import { EMPTY_HARMONIC_VARIANT } from "../../../src/domain/harmony/chord";
import type { HarmonicContext } from "../../../src/domain/harmony/modules/types";
import type { ChordStep, RestStep, StepPerformance } from "../../../src/domain/progression/step";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";

const C_MAJOR_CONTEXT: HarmonicContext = Object.freeze({
  tonic: 0,
  mode: "major",
  moduleId: "progressions",
  spellingContext: {
    tonic: 0,
    mode: "major",
  },
});

function createDefaultPerformance(overrides?: Partial<StepPerformance>): StepPerformance {
  return Object.freeze({
    articulation: "block",
    register: "auto",
    voicingMode: "auto",
    bass: Object.freeze({
      choice: "auto",
      octaveOffset: "auto",
    }),
    masterVelocity: 80,
    perNoteVelocityOverrides: Object.freeze({}),
    dynamicsViewPreference: "musical",
    ...overrides,
  });
}

function createStep(
  id: string,
  functionId: string,
  performance?: Partial<StepPerformance>,
): ChordStep {
  return Object.freeze({
    id,
    kind: "chord",
    harmonicFunction: Object.freeze({
      moduleId: "progressions",
      functionId,
    }),
    harmonicVariant: EMPTY_HARMONIC_VARIANT,
    duration: musicalDuration(rational(4, 1)), // 4 beats
    performance: createDefaultPerformance(performance),
    cardView: "piano",
  });
}

describe("T089 — Canonical performance-event realization", () => {
  it("realizes canonical AudioNoteEvents for a single chord step", () => {
    const step = createStep("step-1", "I", {
      masterVelocity: 85,
      perNoteVelocityOverrides: { "60": 110 },
    });

    const result = realizeStepAudioEvents({
      step,
      tonic: 0,
      context: C_MAJOR_CONTEXT,
      tempoBpm: 120,
      stepStartSeconds: 0,
    });

    // At 120 BPM, 4 beats = 2.0 seconds
    expect(result.stepDurationSeconds).toBe(2.0);
    expect(result.events.length).toBeGreaterThanOrEqual(4); // 3 upper notes + 1 bass note

    for (const evt of result.events) {
      expect(evt.pitch).toBeGreaterThanOrEqual(21);
      expect(evt.pitch).toBeLessThanOrEqual(108);
      expect(evt.startSeconds).toBeGreaterThanOrEqual(0);
      expect(evt.durationSeconds).toBeGreaterThan(0);
      expect(evt.velocity).toBeGreaterThanOrEqual(1);
      expect(evt.velocity).toBeLessThanOrEqual(127);
      expect(["upper", "bass"]).toContain(evt.channelRole);
    }

    // Overridden note 60 has velocity 110; other upper notes inherit master velocity 85
    const note60 = result.events.find((e) => e.pitch === 60);
    expect(note60).toBeDefined();
    expect(note60!.velocity).toBe(110);

    const bassEvent = result.events.find((e) => e.channelRole === "bass");
    expect(bassEvent).toBeDefined();
    expect(bassEvent!.pitch % 12).toBe(0); // C
  });

  it("chains progression steps with chronological start times and contextual voice leading", () => {
    const step1 = createStep("step-1", "I"); // C Major
    const step2 = createStep("step-2", "IV"); // F Major
    const restStep: RestStep = Object.freeze({
      id: "rest-1",
      kind: "rest",
      duration: musicalDuration(rational(2, 1)), // 2 beats
    });
    const step3 = createStep("step-3", "V"); // G Major

    const events = realizeProgressionAudioEvents({
      steps: [step1, step2, restStep, step3],
      tonic: 0,
      context: C_MAJOR_CONTEXT,
      tempoBpm: 120, // 4 beats = 2.0s; 2 beats = 1.0s
      initialStartSeconds: 0,
    });

    // Step 1 events: start at t = 0
    const step1Events = events.filter((e) => e.startSeconds < 2.0);
    expect(step1Events.length).toBeGreaterThan(0);

    // Step 2 events: start at t = 2.0s
    const step2Events = events.filter((e) => e.startSeconds >= 2.0 && e.startSeconds < 4.0);
    expect(step2Events.length).toBeGreaterThan(0);

    // Rest step is 2 beats = 1.0s. No events between 4.0s and 5.0s
    const restEvents = events.filter((e) => e.startSeconds >= 4.0 && e.startSeconds < 5.0);
    expect(restEvents).toHaveLength(0);

    // Step 3 events: start at t = 5.0s
    const step3Events = events.filter((e) => e.startSeconds >= 5.0);
    expect(step3Events.length).toBeGreaterThan(0);

    // All events are sorted chronologically
    for (let i = 0; i < events.length - 1; i++) {
      expect(events[i]!.startSeconds).toBeLessThanOrEqual(events[i + 1]!.startSeconds);
    }
  });

  it("chains both previousUpperPitches and previousBassPitch across progression steps independently", () => {
    // Step 1: IV (F Major). Realizes bass as F
    const step1 = createStep("step-1", "IV");
    // Step 2: I (C Major) with auto bass. Should choose 3rd (E) due to previous bass F
    const step2 = createStep("step-2", "I", { bass: { choice: "auto", octaveOffset: "auto" } });

    const events = realizeProgressionAudioEvents({
      steps: [step1, step2],
      tonic: 0,
      context: C_MAJOR_CONTEXT,
      tempoBpm: 120,
    });

    const step2BassEvent = events.find((e) => e.startSeconds >= 2.0 && e.channelRole === "bass");
    expect(step2BassEvent).toBeDefined();
    // Step 2 Auto bass chooses E (4) because previous bass was F (5)
    expect(step2BassEvent!.pitch % 12).toBe(4); // E
  });
});
