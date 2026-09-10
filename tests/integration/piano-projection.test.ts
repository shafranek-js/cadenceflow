import { describe, expect, it } from "vitest";
import { realizeStepAudioEvents } from "../../src/audio/eventRealizer";
import { exactPitch } from "../../src/domain/harmony/pitch";
import { EMPTY_HARMONIC_VARIANT } from "../../src/domain/harmony/chord";
import { musicalDuration } from "../../src/domain/timing/duration";
import { rational } from "../../src/domain/timing/rational";
import { realizeProgressionStepRealization } from "../../src/instruments/piano/profile";
import { buildPianoKeyboardLayout } from "../../src/ui/piano/pianoKeyboard";
import type { ChordStep } from "../../src/domain/progression/step";

const context = Object.freeze({
  tonic: 0,
  mode: "major" as const,
  activeModuleId: "progressions" as const,
});

const step: ChordStep = Object.freeze({
  id: "piano-contract-step",
  kind: "chord",
  harmonicFunction: Object.freeze({ moduleId: "progressions", functionId: "I" }),
  harmonicVariant: EMPTY_HARMONIC_VARIANT,
  duration: musicalDuration(rational(1, 1)),
  cardView: "piano",
  performance: Object.freeze({
    articulation: "block" as const,
    register: "auto" as const,
    voicingMode: "manual" as const,
    manualVoicing: Object.freeze([
      exactPitch(60, { step: "C", alter: 0 }),
      exactPitch(64, { step: "E", alter: 0 }),
      exactPitch(67, { step: "G", alter: 0 }),
    ]),
    bass: Object.freeze({
      choice: "custom" as const,
      octaveOffset: "auto" as const,
      customPitch: exactPitch(42, { step: "F", alter: 1 }),
    }),
    masterVelocity: 80,
    perNoteVelocityOverrides: Object.freeze({}),
    dynamicsViewPreference: "musical" as const,
  }),
});

describe("Piano Card projection contract", () => {
  it("excludes independent bass from Piano active keys while audio retains it", () => {
    const realization = realizeProgressionStepRealization(step, 0, context);
    const layout = buildPianoKeyboardLayout(realization.pitches);
    const pianoActiveMidi = [...layout.whiteKeys, ...layout.blackKeys]
      .filter((key) => key.isActive)
      .map((key) => key.midi)
      .sort((left, right) => left - right);

    expect(pianoActiveMidi).toEqual([60, 64, 67]);
    expect(pianoActiveMidi).not.toContain(42);

    const audio = realizeStepAudioEvents({
      step,
      tonic: 0,
      context,
      tempoBpm: 120,
    });
    expect(audio.events.find((event) => event.channelRole === "bass")?.pitch).toBe(42);
    expect(
      audio.events.filter((event) => event.channelRole === "upper").map((event) => event.pitch),
    ).toEqual([60, 64, 67]);
  });
});
