import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { formatChordSymbol } from "../../../src/domain/harmony/chord";
import { withEffectiveBass } from "../../../src/domain/progression/effectiveChord";
import { realizeChord } from "../../../src/domain/harmony/realization";
import { resolveGuitarTabEntry } from "../../../src/domain/instruments/guitar/tablature";
import { resolveGuitarChordVoicing } from "../../../src/domain/instruments/guitar/voicings";
import { createDefaultProject } from "../../../src/domain/project/factory";
import {
  snapshotStepPerformance,
  type BassChoice,
  type ChordStep,
} from "../../../src/domain/progression/step";
import { realizeProgressionStepRealization } from "../../../src/instruments/piano/profile";
import { ProgressionStepCard } from "../../../src/ui/progression/ProgressionStepCard";
import { exactPitch } from "../../../src/domain/harmony/pitch";

const el = React.createElement;

const baseProject = Object.freeze({
  ...createDefaultProject("t190-bass-overrides", "T190 Bass Overrides", "2026-09-20T00:00:00.000Z"),
  activeModule: "dark-harmony" as const,
  tonic: 0,
});

function stepWithBass(choice: BassChoice, customPitch?: ReturnType<typeof exactPitch>): ChordStep {
  const step = createMatrixChordStep(baseProject, "N6", `n6-${choice}`);
  return Object.freeze<ChordStep>({
    ...step,
    performance: snapshotStepPerformance({
      ...step.performance,
      bass: {
        choice,
        octaveOffset: "auto",
        ...(customPitch ? { customPitch } : {}),
      },
    }),
  });
}

function effectiveChordFor(step: ChordStep) {
  const chord = {
    ...realizeChord(step.harmonicFunction, baseProject.tonic),
    variant: step.harmonicVariant,
  };
  return withEffectiveBass(
    chord,
    realizeProgressionStepRealization(step, baseProject.tonic).bassPitch,
  );
}

function renderStep(step: ChordStep, view: "harmonic" | "guitar" | "tablature") {
  return renderToString(
    el(ProgressionStepCard, {
      step,
      tonic: baseProject.tonic,
      view,
      selected: false,
      onSelect: () => {},
      onPerformanceChange: () => {},
      onRemove: () => {},
    }),
  );
}

function lowestPitchClass(pitches: readonly { readonly midiNumber: number }[]): number {
  return Math.min(...pitches.map((pitch) => pitch.midiNumber)) % 12;
}

describe("T190 N6 authored bass overrides", () => {
  it("keeps Auto as Db/F and projects the same actual bass to Guitar and Tab", () => {
    const step = stepWithBass("auto");
    const chord = effectiveChordFor(step);
    expect(formatChordSymbol(chord)).toBe("Db/F");
    expect(renderStep(step, "harmonic")).toContain("Db/F");
    expect(renderStep(step, "guitar")).toContain('class="mini-guitar-chord-name">Db/F</strong>');
    expect(renderStep(step, "tablature")).toContain('class="mini-tab-chord-name">Db/F</strong>');

    expect(lowestPitchClass(resolveGuitarChordVoicing(chord).pitches)).toBe(5);
    expect(lowestPitchClass(resolveGuitarTabEntry(chord).voicing.pitches)).toBe(5);
  });

  it("lets an authored Root override remove the semantic slash everywhere", () => {
    const step = stepWithBass("root");
    const chord = effectiveChordFor(step);
    expect(formatChordSymbol(chord)).toBe("Db");
    expect(renderStep(step, "guitar")).toContain('class="mini-guitar-chord-name">Db</strong>');
    expect(renderStep(step, "tablature")).toContain('class="mini-tab-chord-name">Db</strong>');
    expect(renderStep(step, "guitar")).not.toContain("Db/F");
    expect(lowestPitchClass(resolveGuitarChordVoicing(chord).pitches)).toBe(1);
    expect(lowestPitchClass(resolveGuitarTabEntry(chord).voicing.pitches)).toBe(1);
  });

  it("uses the authored Custom bass in the slash label and both guitar projections", () => {
    const step = stepWithBass("custom", exactPitch(43, { step: "G", alter: 0 }));
    const chord = effectiveChordFor(step);
    expect(formatChordSymbol(chord)).toBe("Db/G");
    expect(renderStep(step, "harmonic")).toContain("Db/G");
    expect(renderStep(step, "guitar")).toContain('class="mini-guitar-chord-name">Db/G</strong>');
    expect(renderStep(step, "tablature")).toContain('class="mini-tab-chord-name">Db/G</strong>');
    expect(lowestPitchClass(resolveGuitarChordVoicing(chord).pitches)).toBe(7);
    expect(lowestPitchClass(resolveGuitarTabEntry(chord).voicing.pitches)).toBe(7);
  });
});
