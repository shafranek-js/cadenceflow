import { describe, expect, it } from "vitest";
import {
  realizeGuitarStepAudioEvents,
  realizeProgressionAudioEvents,
  realizeStepAudioEvents,
} from "../../../src/audio/eventRealizer";
import { realizeChord } from "../../../src/domain/harmony/realization";
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

describe("realizeGuitarStepAudioEvents — Guitar articulation & soundfont realization", () => {
  const cMajorChord = realizeChord({ moduleId: "progressions", functionId: "I" }, 0);

  it("realizes block articulation with natural guitar downstrum stagger", () => {
    const step = createStep("g-1", "I", { articulation: "block", masterVelocity: 85 });
    const result = realizeGuitarStepAudioEvents({
      chord: cMajorChord,
      step,
      tempoBpm: 120,
      instrument: "gm-025",
    });

    expect(result.pitches.length).toBeGreaterThanOrEqual(4);
    expect(result.events.length).toBe(result.pitches.length);
    expect(result.totalDurationSeconds).toBe(2.0);

    // First note at t = 0
    expect(result.events[0]!.startSeconds).toBe(0);
    expect(result.events[0]!.instrument).toBe("gm-025");
    expect(result.events[0]!.channelRole).toBe("bass");

    // The first-to-last onset spread stays 30ms, independent of chord voicing size.
    expect(result.events.at(-1)!.startSeconds - result.events[0]!.startSeconds).toBeCloseTo(0.03);
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i]!.startSeconds).toBeGreaterThan(result.events[i - 1]!.startSeconds);
      expect(result.events[i]!.startSeconds - result.events[i - 1]!.startSeconds).toBeCloseTo(
        0.03 / (result.events.length - 1),
      );
      expect(result.events[i]!.channelRole).toBe("upper");
      expect(result.events[i]!.instrument).toBe("gm-025");
    }
  });

  it("realizes arp-up articulation with ascending pitch start times", () => {
    const step = createStep("g-2", "I", { articulation: "arp-up" });
    const result = realizeGuitarStepAudioEvents({
      chord: cMajorChord,
      step,
      tempoBpm: 120,
    });

    expect(result.events.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < result.events.length; i++) {
      // Arp-up: strictly increasing start times and ascending pitches
      expect(result.events[i]!.startSeconds).toBeGreaterThan(result.events[i - 1]!.startSeconds);
      expect(result.events[i]!.pitch).toBeGreaterThanOrEqual(result.events[i - 1]!.pitch);
    }
  });

  it("realizes arp-down articulation with descending pitch start times", () => {
    const step = createStep("g-3", "I", { articulation: "arp-down" });
    const result = realizeGuitarStepAudioEvents({
      chord: cMajorChord,
      step,
      tempoBpm: 120,
    });

    expect(result.events.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < result.events.length; i++) {
      // Arp-down: strictly increasing start times and descending pitches
      expect(result.events[i]!.startSeconds).toBeGreaterThan(result.events[i - 1]!.startSeconds);
      expect(result.events[i]!.pitch).toBeLessThanOrEqual(result.events[i - 1]!.pitch);
    }
  });

  it("realizes broken-chord articulation with bass group and delayed treble group", () => {
    const step = createStep("g-4", "I", { articulation: "broken-chord" });
    const result = realizeGuitarStepAudioEvents({
      chord: cMajorChord,
      step,
      tempoBpm: 120,
    });

    expect(result.events.length).toBeGreaterThanOrEqual(4);
    const firstNote = result.events[0]!;
    const lastNote = result.events[result.events.length - 1]!;

    expect(firstNote.startSeconds).toBe(0);
    // Upper group delayed by ~110ms
    expect(lastNote.startSeconds).toBeGreaterThanOrEqual(0.1);
  });

  it("realizes humanized articulation with deterministic jitter and dynamics", () => {
    const step = createStep("g-5", "I", { articulation: "humanized", masterVelocity: 80 });
    const result1 = realizeGuitarStepAudioEvents({
      chord: cMajorChord,
      step,
      tempoBpm: 120,
    });
    const result2 = realizeGuitarStepAudioEvents({
      chord: cMajorChord,
      step,
      tempoBpm: 120,
    });

    expect(result1.events).toEqual(result2.events);
    // Bass note anchors at t = 0
    expect(result1.events[0]!.startSeconds).toBe(0);
    expect(result1.events[0]!.channelRole).toBe("bass");

    for (const evt of result1.events) {
      expect(evt.velocity).toBeGreaterThanOrEqual(1);
      expect(evt.velocity).toBeLessThanOrEqual(127);
      expect(evt.startSeconds).toBeLessThan(0.1);
    }
  });

  it("respects per-note velocity overrides and master velocity", () => {
    const cVoicing = realizeGuitarStepAudioEvents({
      chord: cMajorChord,
      tempoBpm: 120,
    });
    const firstPitch = cVoicing.pitches[0]!.midiNumber;

    const step = createStep("g-6", "I", {
      masterVelocity: 75,
      perNoteVelocityOverrides: { [String(firstPitch)]: 115 },
    });
    const result = realizeGuitarStepAudioEvents({
      chord: cMajorChord,
      step,
      tempoBpm: 120,
    });

    const targetNote = result.events.find((e) => e.pitch === firstPitch);
    expect(targetNote).toBeDefined();
    expect(targetNote!.velocity).toBe(115);
  });
});
