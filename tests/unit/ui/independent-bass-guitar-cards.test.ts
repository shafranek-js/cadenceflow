// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import {
  resolveGuitarChordVoicing,
  withGuitarStepBass,
} from "../../../src/domain/instruments/guitar/voicings";
import { resolveGuitarTabEntry } from "../../../src/domain/instruments/guitar/tablature";
import {
  realizeProgressionStepChord,
  transposeChordDefinition,
} from "../../../src/domain/progression/transposition";
import { createProgressionMeasureLayout } from "../../../src/domain/timing/measureLayout";
import { realizeGuitarStepAudioEvents } from "../../../src/audio/eventRealizer";
import { createPianoRollSystemChordFixture } from "../../fixtures/piano-roll-system-chord.fixture";
import { PianoRollChordCards } from "../../../src/ui/melody/PianoRollChordCards";

const originalResizeObserver = globalThis.ResizeObserver;

beforeAll(() => {
  if (typeof globalThis.ResizeObserver !== "undefined") return;
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: class TestResizeObserver {
      constructor(_callback: ResizeObserverCallback) {}
      observe(_target: Element, _options?: ResizeObserverOptions) {}
      unobserve(_target: Element) {}
      disconnect() {}
    },
  });
});

afterAll(() => {
  if (originalResizeObserver === undefined)
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  else globalThis.ResizeObserver = originalResizeObserver;
});

function mount(project: ReturnType<typeof createPianoRollSystemChordFixture>) {
  const measure = createProgressionMeasureLayout(
    project.progression.steps,
    project.globalTiming.meter,
  ).measures[0];
  if (!measure) throw new Error("Fixture must contain a Measure");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(
      React.createElement(PianoRollChordCards, {
        project,
        measure,
        visibility: { piano: false, guitar: true },
        labelMode: "inline",
        selectedStepIds: new Set<string>(),
        onSelect: () => undefined,
      }),
    ),
  );
  const card = container.querySelector<HTMLElement>(".mini-guitar-card-visual");
  if (!card) throw new Error("Fixture must render a guitar card");
  const result = {
    chordSymbol: card.dataset.chordSymbol,
    frets: card.dataset.frets,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
  return result;
}

describe("independent bass does not change guitar-card chord shape", () => {
  it("keeps the upper-voice inversion and guitar fingering when a separate custom bass is enabled", () => {
    const source = createPianoRollSystemChordFixture("independent-bass-guitar-card");
    const firstChord = source.progression.steps.find((step) => step.kind === "chord");
    if (!firstChord || firstChord.kind !== "chord")
      throw new Error("Fixture must contain a chord Step");
    const customStep = {
      ...firstChord,
      transpositionSemitones: 2,
      performance: {
        ...firstChord.performance,
        inversion: 1 as const,
        bass: {
          choice: "custom" as const,
          octaveOffset: "auto" as const,
          customPitch: exactPitch(37, { step: "C", alter: 1 }),
        },
      },
    };
    const steps = source.progression.steps.map((step) =>
      step.id === firstChord.id ? customStep : step,
    );
    const harmonicChord = realizeProgressionStepChord(customStep, source.tonic);
    const guitarChord = withGuitarStepBass(harmonicChord, customStep, "concert");
    expect(guitarChord.bassPitchClass).toBe(3);
    const sourceFrameChord = withGuitarStepBass(
      transposeChordDefinition(harmonicChord, -2),
      customStep,
      "source",
    );
    const transposedSourceShape = resolveGuitarChordVoicing(
      transposeChordDefinition(sourceFrameChord, 2),
    )
      .pitches.map((pitch) => pitch.midiNumber)
      .sort((left, right) => left - right);
    expect(transposedSourceShape).toEqual(
      resolveGuitarChordVoicing(guitarChord)
        .pitches.map((pitch) => pitch.midiNumber)
        .sort((left, right) => left - right),
    );
    const expectedPitches = resolveGuitarChordVoicing(guitarChord)
      .pitches.map((pitch) => pitch.midiNumber)
      .sort((left, right) => left - right);
    const audioPitches = realizeGuitarStepAudioEvents({
      chord: harmonicChord,
      step: customStep,
      tempoBpm: source.globalTiming.tempoBpm,
    })
      .pitches.map((pitch) => pitch.midiNumber)
      .sort((left, right) => left - right);
    const tablaturePitches = resolveGuitarTabEntry(guitarChord)
      .voicing.pitches.map((pitch) => pitch.midiNumber)
      .sort((left, right) => left - right);
    expect(audioPitches).toEqual(expectedPitches);
    expect(tablaturePitches).toEqual(expectedPitches);

    const disabled = mount({
      ...source,
      independentBassEnabled: false,
      progression: { ...source.progression, steps },
    });
    const enabled = mount({
      ...source,
      independentBassEnabled: true,
      progression: { ...source.progression, steps },
    });

    expect(enabled.chordSymbol).toBe(disabled.chordSymbol);
    expect(enabled.frets).toBe(disabled.frets);

    disabled.unmount();
    enabled.unmount();
  });
});
