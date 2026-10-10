import { useState } from "react";
import type { AuthoredMelodyEdit } from "../../app/commands/authoredMelodyTransaction";
import { exactPitch } from "../../domain/harmony/pitch";
import { modeForModule } from "../../domain/harmony/functions";
import type { EffectiveMelodyNote } from "../../domain/melody/effectiveTimeline";
import type { Project } from "../../domain/project/project";
import { compareRational, multiplyRational, rational } from "../../domain/timing/rational";
import type { ScoreSystem } from "../../notation/scoreSystemProjection";
import { pianoRollPaletteColor, pianoRollPaletteDegrees } from "./pianoRollProjection";
import { readPianoRollPreferences, writePianoRollPreferences } from "./pianoRollPreferences";

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10] as const;
const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const ENHARMONIC_NAMES = [
  "C",
  "C♯/D♭",
  "D",
  "D♯/E♭",
  "E",
  "F",
  "F♯/G♭",
  "G",
  "G♯/A♭",
  "A",
  "A♯/B♭",
  "B",
];
const MIDI_NAMES = [
  ["C", 0],
  ["C", 1],
  ["D", 0],
  ["D", 1],
  ["E", 0],
  ["F", 0],
  ["F", 1],
  ["G", 0],
  ["G", 1],
  ["A", 0],
  ["A", 1],
  ["B", 0],
] as const;
const DURATION_PRESETS = ["4/1", "2/1", "1/1", "1/2", "1/4"] as const;

function pitchAt(midi: number) {
  const [step, alter] = MIDI_NAMES[((midi % 12) + 12) % 12]!;
  return exactPitch(midi, { step: step as "C" | "D" | "E" | "F" | "G" | "A" | "B", alter });
}

function selectedIdentity(note: { sourceStepId: string; eventKey: string }) {
  return JSON.stringify([note.sourceStepId, note.eventKey]);
}

export function PianoRollSystemNotePanel({
  project,
  effectiveNotes,
  system,
  selectedNoteIdentities,
  activeNoteIdentity,
  activeSystemIndex,
  onApply,
}: {
  readonly project: Project;
  readonly effectiveNotes: readonly EffectiveMelodyNote[];
  readonly system: ScoreSystem;
  readonly selectedNoteIdentities: ReadonlySet<string>;
  readonly activeNoteIdentity: string | null;
  readonly activeSystemIndex?: number | null;
  readonly onApply?: (edits: readonly AuthoredMelodyEdit[]) => void;
}) {
  const [paletteMode, setPaletteMode] = useState<"degrees" | "chromatic">(
    () => readPianoRollPreferences().paletteMode,
  );
  const [duration, setDurationState] = useState(
    () => readPianoRollPreferences().prospectiveDuration,
  );
  const [triplet, setTripletState] = useState(() => readPianoRollPreferences().prospectiveTriplet);
  const [message, setMessage] = useState("");
  const notes = effectiveNotes;
  const first = system.measures[0]?.measure;
  const last = system.measures.at(-1)?.measure;
  const start = first?.startBeats;
  const end = last?.endBeats;
  const selected = notes.filter((note) => selectedNoteIdentities.has(selectedIdentity(note)));
  const active = notes.find((note) => selectedIdentity(note) === activeNoteIdentity);
  const activeBelongsToSystem =
    activeSystemIndex !== undefined && activeSystemIndex !== null
      ? activeSystemIndex === system.index
      : active !== undefined &&
        start !== undefined &&
        end !== undefined &&
        compareRational(active.startBeats, start) >= 0 &&
        compareRational(active.startBeats, end) < 0;
  const tonic = project.tonic;
  const noteDuration = (() => {
    if (selected.length === 0) return null;
    const exact = selected[0]!.durationBeats;
    if (!selected.every((note) => compareRational(note.durationBeats, exact) === 0)) {
      return { kind: "mixed" as const };
    }
    for (const preset of DURATION_PRESETS) {
      const [n, d] = preset.split("/").map(Number);
      const base = rational(n ?? 1, d ?? 1);
      if (compareRational(exact, base) === 0) {
        return { kind: "preset" as const, duration: preset, triplet: false };
      }
      if (compareRational(exact, multiplyRational(base, rational(2, 3))) === 0) {
        return { kind: "preset" as const, duration: preset, triplet: true };
      }
    }
    return { kind: "custom" as const };
  })();
  const displayedDuration =
    noteDuration?.kind === "preset" ? noteDuration.duration : noteDuration ? "custom" : duration;
  const displayedTriplet =
    noteDuration?.kind === "preset" ? noteDuration.triplet : noteDuration ? false : triplet;
  const scale: readonly number[] =
    modeForModule(project.activeModule) === "major" ? MAJOR_STEPS : MINOR_STEPS;
  const changePalette = (mode: "degrees" | "chromatic") => {
    setPaletteMode(mode);
    writePianoRollPreferences({ ...readPianoRollPreferences(), paletteMode: mode });
  };
  const setDuration = (value: string) => {
    if (!["4/1", "2/1", "1/1", "1/2", "1/4"].includes(value)) return;
    const next = value as "4/1" | "2/1" | "1/1" | "1/2" | "1/4";
    setDurationState(next);
    writePianoRollPreferences({ ...readPianoRollPreferences(), prospectiveDuration: next });
  };
  const setTriplet = (value: boolean) => {
    setTripletState(value);
    writePianoRollPreferences({ ...readPianoRollPreferences(), prospectiveTriplet: value });
  };
  const applyPitch = (midi: number) => {
    if (!active || selected.length === 0) return;
    const targetMidi = Math.floor(active.pitch.midiNumber / 12) * 12 + (midi % 12);
    const delta = targetMidi - active.pitch.midiNumber;
    const targetPitches = selected.map((note) => note.pitch.midiNumber + delta);
    if (targetPitches.some((value) => value < 0 || value > 127)) {
      setMessage("The whole selection must stay within MIDI 0–127.");
      return;
    }
    if (delta === 0) return;
    const changed = selected.map((note) => ({
      type: "upsert" as const,
      sourceStepId: note.sourceStepId,
      note: {
        id: note.eventKey,
        pitch: pitchAt(note.pitch.midiNumber + delta),
        startBeats: note.startBeats,
        durationBeats: note.durationBeats,
      },
    }));
    setMessage("");
    onApply?.(changed);
  };
  const transpose = (direction: -1 | 1, semitones: number | "scale") => {
    if (!active || selected.length === 0) return;
    let delta: number;
    if (semitones === "scale") {
      delta = direction;
      while (delta > -128 && delta < 128) {
        const pc = (((active.pitch.midiNumber + delta - tonic) % 12) + 12) % 12;
        if (scale.includes(pc)) break;
        delta += direction;
      }
    } else delta = direction * semitones;
    if (
      selected.some(
        (note) => note.pitch.midiNumber + delta < 0 || note.pitch.midiNumber + delta > 127,
      )
    ) {
      setMessage("The whole selection must stay within MIDI 0–127.");
      return;
    }
    if (delta === 0) return;
    const changed = selected.map((note) => ({
      type: "upsert" as const,
      sourceStepId: note.sourceStepId,
      note: {
        id: note.eventKey,
        pitch: pitchAt(note.pitch.midiNumber + delta),
        startBeats: note.startBeats,
        durationBeats: note.durationBeats,
      },
    }));
    setMessage("");
    onApply?.(changed);
  };
  const applyDuration = (durationValue: string = duration, tripletValue = triplet) => {
    if (!["4/1", "2/1", "1/1", "1/2", "1/4"].some((value) => value === durationValue)) return;
    if (selected.length === 0) return;
    const [n, d] = durationValue.split("/").map(Number);
    const base = rational(n ?? 1, d ?? 1);
    const beats = tripletValue ? multiplyRational(base, rational(2, 3)) : base;
    if (selected.every((note) => compareRational(note.durationBeats, beats) === 0)) return;
    const changed = selected.map((note) => ({
      type: "upsert" as const,
      sourceStepId: note.sourceStepId,
      note: {
        id: note.eventKey,
        pitch: note.pitch,
        startBeats: note.startBeats,
        durationBeats: beats,
      },
    }));
    setMessage("");
    onApply?.(changed);
  };
  const removeSelected = () => {
    if (selected.length === 0) return;
    onApply?.(
      selected.map((note) => ({
        type: "delete" as const,
        noteId: note.eventKey,
        sourceStepId: note.sourceStepId,
      })),
    );
    setMessage("");
  };
  const palettePitches =
    paletteMode === "degrees"
      ? scale.map((offset, degree) => ({
          midi: tonic + offset,
          label: `${degree + 1}·${NOTE_NAMES[(tonic + offset) % 12]}`,
        }))
      : Array.from({ length: 12 }, (_, pc) => ({ midi: pc, label: NOTE_NAMES[pc]! }));

  if (!active || !activeBelongsToSystem) return null;

  return (
    <div
      className="piano-roll-system-note-panel"
      role="group"
      aria-label={`System ${system.index + 1} note editing`}
      data-testid={`piano-roll-system-note-panel-${system.index}`}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        const noteToFocus =
          selected.find((note) => selectedIdentity(note) === activeNoteIdentity) ?? active;
        if (!noteToFocus) return;
        const noteButton = Array.from(
          document.querySelectorAll<HTMLButtonElement>("button.piano-roll-note"),
        ).find(
          (button) =>
            button.dataset.sourceStepId === noteToFocus.sourceStepId &&
            button.dataset.pianoRollEventKey === noteToFocus.eventKey,
        );
        if (!noteButton) return;
        event.preventDefault();
        event.stopPropagation();
        noteButton.focus({ preventScroll: true });
      }}
    >
      <div className="piano-roll-note-palette-mode" role="group" aria-label="Note palette mode">
        <button
          type="button"
          aria-label="Degrees"
          aria-pressed={paletteMode === "degrees"}
          onClick={() => changePalette("degrees")}
        >
          Deg
        </button>
        <button
          type="button"
          aria-label="Chromatic"
          aria-pressed={paletteMode === "chromatic"}
          onClick={() => changePalette("chromatic")}
        >
          Chrom
        </button>
      </div>
      <div className="piano-roll-note-palette" role="group" aria-label="Choose note pitch">
        {palettePitches.map(({ midi, label }, index) => {
          const midiClass = ((midi % 12) + 12) % 12;
          const degrees = pianoRollPaletteDegrees(midiClass, tonic, project.activeModule);
          const accessibleLabel =
            paletteMode === "chromatic" ? ENHARMONIC_NAMES[midiClass]! : label;
          return (
            <button
              key={`${paletteMode}-${midi}-${index}`}
              type="button"
              aria-label={`Set selected note to ${accessibleLabel}`}
              title={accessibleLabel}
              aria-pressed={active.pitch.pitchClassIdentity === midiClass}
              style={{ backgroundColor: pianoRollPaletteColor(degrees[0] ?? index + 1) }}
              onClick={() => applyPitch(midi)}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="piano-roll-note-transpose" role="group" aria-label="Transpose selected notes">
        <button
          type="button"
          aria-label="Previous note in scale"
          title="Lower selected notes to the previous note in the active scale"
          onClick={() => transpose(-1, "scale")}
        >
          S−
        </button>
        <button
          type="button"
          aria-label="Next note in scale"
          title="Raise selected notes to the next note in the active scale"
          onClick={() => transpose(1, "scale")}
        >
          S+
        </button>
        <button
          type="button"
          aria-label="Octave down"
          title="Lower selected notes by one octave"
          onClick={() => transpose(-1, 12)}
        >
          8−
        </button>
        <button
          type="button"
          aria-label="Octave up"
          title="Raise selected notes by one octave"
          onClick={() => transpose(1, 12)}
        >
          8+
        </button>
        <button
          type="button"
          aria-label="Half-step down"
          title="Lower selected notes by one semitone"
          onClick={() => transpose(-1, 1)}
        >
          ½−
        </button>
        <button
          type="button"
          aria-label="Half-step up"
          title="Raise selected notes by one semitone"
          onClick={() => transpose(1, 1)}
        >
          ½+
        </button>
      </div>
      <div className="piano-roll-note-duration" role="group" aria-label="Selected note duration">
        <select
          aria-label="Note duration"
          value={displayedDuration}
          onChange={(event) => {
            const value = event.target.value;
            setDuration(value);
            applyDuration(value, displayedTriplet);
          }}
        >
          {displayedDuration === "custom" ? (
            <option value="custom" disabled>
              {noteDuration?.kind === "mixed"
                ? "Mixed"
                : `Current: ${selected[0]!.durationBeats.numerator}/${selected[0]!.durationBeats.denominator}`}
            </option>
          ) : null}
          <option value="4/1">Whole</option>
          <option value="2/1">Half</option>
          <option value="1/1">Quarter</option>
          <option value="1/2">Eighth</option>
          <option value="1/4">Sixteenth</option>
        </select>
        <label>
          <input
            type="checkbox"
            aria-label="Triplet"
            title={
              noteDuration?.kind === "custom" || noteDuration?.kind === "mixed"
                ? "Choose a duration preset before applying Triplet to a custom or mixed selection"
                : "Apply or remove the exact 2/3 triplet duration"
            }
            checked={displayedTriplet}
            disabled={noteDuration?.kind === "custom" || noteDuration?.kind === "mixed"}
            onChange={(event) => {
              const value = event.target.checked;
              setTriplet(value);
              applyDuration(
                noteDuration?.kind === "preset" ? noteDuration.duration : duration,
                value,
              );
            }}
          />{" "}
          T
        </label>
        <button
          type="button"
          aria-label="Delete selected notes"
          title="Delete selected notes"
          onClick={removeSelected}
        >
          Del
        </button>
      </div>
      <span className="piano-roll-note-selection-count">{selected.length} selected</span>
      {message ? <span role="status">{message}</span> : null}
    </div>
  );
}
