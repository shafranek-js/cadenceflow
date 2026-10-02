import type { ExactPitch } from "../../domain/harmony/pitch";
import { formatPitchSpelling } from "../../domain/harmony/spelling";
import { buildPianoKeyboardLayout, normalizeChordPitches } from "./pianoKeyboard";
import type { PianoKeyboardKey } from "./pianoKeyboard";
import {
  classifyHarmonicNoteRole,
  type HarmonicNoteRoleContext,
} from "../../domain/harmony/noteRoles";
import type { NoteColorMode } from "../../domain/project/project";
import type { LabelHierarchyMode } from "../progression/labelHierarchy";
import { ProgressionChordLabel } from "../progression/ProgressionChordLabel";

function formatChordPitch(pitch: ExactPitch): string {
  return `${formatPitchSpelling(pitch.spelling)}${pitch.octave}`;
}

function keyClassName(
  key: PianoKeyboardKey,
  noteColorMode: NoteColorMode,
  roleContext?: HarmonicNoteRoleContext,
): string {
  const role = roleContext ? classifyHarmonicNoteRole(key.pitchClass, roleContext) : undefined;
  const roleClass =
    noteColorMode === "harmonic-role" && role
      ? ` harmonic-role-${role.primary}${role.targetNext ? " is-target-next" : ""}`
      : "";
  return `mini-key ${key.isBlack ? "mini-black-key" : "mini-white-key"}${key.isActive ? " is-active is-pressed" : ""}${roleClass}`;
}

function roleSummary(context?: HarmonicNoteRoleContext): string {
  if (!context) return "";
  const names = [
    "C",
    "C sharp",
    "D",
    "D sharp",
    "E",
    "F",
    "F sharp",
    "G",
    "G sharp",
    "A",
    "A sharp",
    "B",
  ];
  return Array.from({ length: 12 }, (_, pitchClass) => {
    const role = classifyHarmonicNoteRole(pitchClass, context);
    return `${names[pitchClass]}: ${role.primary.replace("-", " ")}${role.targetNext ? ", target next" : ""}`;
  }).join("; ");
}

const NATURAL_KEY_LABELS: Readonly<Record<number, string>> = Object.freeze({
  0: "C",
  2: "D",
  4: "E",
  5: "F",
  7: "G",
  9: "A",
  11: "B",
});

export function PianoCardView({
  chordPitches,
  bassPitch,
  chordLabel,
  labelMode,
  functionLabel,
  noteColorMode = "standard",
  roleContext,
}: {
  readonly chordPitches: readonly ExactPitch[];
  readonly bassPitch?: ExactPitch | undefined;
  readonly chordLabel: string;
  readonly labelMode?: LabelHierarchyMode;
  readonly functionLabel?: string;
  readonly noteColorMode?: NoteColorMode;
  readonly roleContext?: HarmonicNoteRoleContext;
}) {
  const normalizedPitches = normalizeChordPitches(
    bassPitch ? [...chordPitches, bassPitch] : chordPitches,
  );
  const layout = buildPianoKeyboardLayout(normalizedPitches);
  const noteLabels = normalizedPitches.map((pitch) => {
    const role = roleContext
      ? classifyHarmonicNoteRole(pitch.midiNumber % 12, roleContext)
      : undefined;
    return `${formatChordPitch(pitch)}${role ? `, ${role.primary.replace("-", " ")}${role.targetNext ? ", target next" : ""}` : ""}`;
  });
  const noteLabel = noteLabels.join(roleContext ? "; " : ", ");
  const pitchByMidi = new Map(normalizedPitches.map((pitch) => [pitch.midiNumber, pitch]));
  const chordOctave = normalizedPitches[0]?.octave ?? 4;

  return (
    <div className="mini-piano-card-visual">
      <div className="mini-piano-heading">
        {labelMode && functionLabel ? (
          <ProgressionChordLabel
            mode={labelMode}
            functionLabel={functionLabel}
            chordLabel={chordLabel}
            className="mini-piano-chord-name"
          />
        ) : (
          <strong className="mini-piano-chord-name">{chordLabel}</strong>
        )}
        <span className="mini-piano-octave" aria-label={`Chord starts in octave ${chordOctave}`}>
          {`Oct ${chordOctave}`}
        </span>
      </div>
      <div
        className="mini-piano"
        role="img"
        aria-label={`${chordLabel} chord on piano: ${noteLabel || "none"}${noteColorMode === "harmonic-role" && roleContext ? `. Harmonic roles: ${roleSummary(roleContext)}` : ""}`}
        data-start-midi={layout.startMidi}
        data-end-midi={layout.endMidiExclusive - 1}
      >
        <div className="mini-piano-white-layer" aria-hidden="true">
          {layout.whiteKeys.map((key) => (
            <span
              key={key.midi}
              className={keyClassName(key, noteColorMode, roleContext)}
              data-midi={key.midi}
              data-active={key.isActive ? "true" : "false"}
              data-pressed={key.isActive ? "true" : "false"}
              data-harmonic-role={
                roleContext
                  ? classifyHarmonicNoteRole(key.pitchClass, roleContext).primary
                  : undefined
              }
              data-target-next={
                roleContext?.nextChordPitchClasses.includes(key.pitchClass) ? "true" : "false"
              }
            />
          ))}
        </div>
        <div className="mini-piano-black-layer" aria-hidden="true">
          {layout.blackKeys.map((key) => (
            <span
              key={key.midi}
              className={keyClassName(key, noteColorMode, roleContext)}
              data-midi={key.midi}
              data-active={key.isActive ? "true" : "false"}
              data-pressed={key.isActive ? "true" : "false"}
              data-harmonic-role={
                roleContext
                  ? classifyHarmonicNoteRole(key.pitchClass, roleContext).primary
                  : undefined
              }
              data-target-next={
                roleContext?.nextChordPitchClasses.includes(key.pitchClass) ? "true" : "false"
              }
              style={{
                left: `${((key.precedingWhiteIndex + 1) / layout.whiteKeys.length) * 100}%`,
                width: `${(0.62 / layout.whiteKeys.length) * 100}%`,
              }}
            />
          ))}
        </div>
      </div>
      <div className="mini-piano-key-labels" aria-hidden="true">
        <div className="mini-piano-accidental-labels">
          {layout.blackKeys.map((key) => {
            const pitch = pitchByMidi.get(key.midi);
            return pitch ? (
              <span
                key={key.midi}
                className="mini-piano-accidental-key-label"
                style={{
                  left: `${((key.precedingWhiteIndex + 1) / layout.whiteKeys.length) * 100}%`,
                }}
              >
                {formatPitchSpelling(pitch.spelling)}
              </span>
            ) : null;
          })}
        </div>
        <div className="mini-piano-white-key-labels">
          {layout.whiteKeys.map((key) => (
            <span
              key={key.midi}
              className={`mini-piano-white-key-label${key.isActive ? " is-active" : ""}`}
              data-midi={key.midi}
            >
              {key.isActive ? NATURAL_KEY_LABELS[key.pitchClass] : null}
            </span>
          ))}
        </div>
      </div>
      {noteColorMode === "harmonic-role" && roleContext ? (
        <div className="mini-piano-role-legend" aria-hidden="true">
          <span>● Root</span>
          <span>◆ Chord</span>
          <span>○ Scale</span>
          <span>△ Altered</span>
          <span>→ Target</span>
        </div>
      ) : null}
    </div>
  );
}
