import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { PianoCardView } from "../../../src/ui/piano/PianoCardView";
import {
  buildPianoKeyboardLayout,
  normalizeChordPitches,
} from "../../../src/ui/piano/pianoKeyboard";

const el = React.createElement;

describe("Piano Card keyboard geometry", () => {
  it("builds the seven-white-key reference window", () => {
    const layout = buildPianoKeyboardLayout([
      exactPitch(60, { step: "C", alter: 0 }),
      exactPitch(64, { step: "E", alter: 0 }),
      exactPitch(67, { step: "G", alter: 0 }),
    ]);

    expect(layout.startMidi).toBe(60);
    expect(layout.endMidiExclusive).toBe(72);
    expect(layout.whiteKeys.map((key) => key.midi)).toEqual([60, 62, 64, 65, 67, 69, 71]);
    expect(layout.blackKeys.map((key) => key.midi)).toEqual([61, 63, 66, 68, 70]);
    expect(layout.blackKeys.every((key) => key.isBlack)).toBe(true);
  });

  it("uses only unique exact chord MIDI pitches and keeps separate octaves", () => {
    const pitches = [
      exactPitch(76, { step: "E", alter: 0 }),
      exactPitch(60, { step: "C", alter: 0 }),
      exactPitch(60, { step: "C", alter: 0 }),
      exactPitch(64, { step: "E", alter: 0 }),
      exactPitch(76, { step: "E", alter: 0 }),
    ];

    expect(normalizeChordPitches(pitches).map((pitch) => pitch.midiNumber)).toEqual([60, 64, 76]);
    const layout = buildPianoKeyboardLayout(pitches);
    const activeMidi = [...layout.whiteKeys, ...layout.blackKeys]
      .filter((key) => key.isActive)
      .map((key) => key.midi)
      .sort((left, right) => left - right);
    expect(activeMidi).toEqual([60, 64, 76]);
  });

  it("expands the compact window for a voicing wider than the reference frame", () => {
    const layout = buildPianoKeyboardLayout([
      exactPitch(48, { step: "C", alter: 0 }),
      exactPitch(90, { step: "F", alter: 1 }),
    ]);

    expect(layout.startMidi).toBe(48);
    expect(layout.endMidiExclusive).toBe(92);
    expect(layout.whiteKeys.some((key) => key.midi === 90)).toBe(false);
    expect(layout.blackKeys.find((key) => key.midi === 90)?.isActive).toBe(true);
  });

  it("renders an accessible two-layer keyboard without individual tab stops", () => {
    const html = renderToString(
      el(PianoCardView, {
        chordLabel: "C",
        chordPitches: [
          exactPitch(60, { step: "C", alter: 0 }),
          exactPitch(64, { step: "E", alter: 0 }),
          exactPitch(67, { step: "G", alter: 0 }),
        ],
      }),
    );

    expect(html).toContain('role="img"');
    expect(html).toContain('class="mini-piano-chord-name">C</strong>');
    expect(html).toContain('class="mini-piano-octave" aria-label="Chord starts in octave 4"');
    expect(html).toContain("Oct 4");
    expect(html).toContain('aria-label="C chord on piano: C4, E4, G4"');
    expect((html.match(/mini-white-key/g) ?? []).length).toBe(7);
    expect((html.match(/mini-black-key/g) ?? []).length).toBe(5);
    expect((html.match(/data-active="true"/g) ?? []).length).toBe(3);
    expect((html.match(/data-pressed="true"/g) ?? []).length).toBe(3);
    expect((html.match(/is-pressed/g) ?? []).length).toBe(3);
    expect((html.match(/class="mini-piano-white-key-label"/g) ?? []).length).toBe(4);
    expect((html.match(/mini-piano-white-key-label is-active/g) ?? []).length).toBe(3);
    expect(html).toContain('data-midi="60">C</span>');
    expect(html).toContain('data-midi="62"></span>');
    expect(html).toContain('data-midi="60"');
    expect(html).toContain('data-midi="64"');
    expect(html).toContain('data-midi="67"');
    expect(html).not.toContain("tabindex=");
  });

  it("never renders a clipped black key without both adjacent white keys", () => {
    const layout = buildPianoKeyboardLayout([
      exactPitch(60, { step: "C", alter: 0 }),
      exactPitch(70, { step: "B", alter: -1 }),
    ]);
    const whiteMidi = new Set(layout.whiteKeys.map((key) => key.midi));

    expect(
      layout.blackKeys.every((key) => whiteMidi.has(key.midi - 1) && whiteMidi.has(key.midi + 1)),
    ).toBe(true);
  });
});
