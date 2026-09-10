import type { ExactPitch } from "../../domain/harmony/pitch";
import { formatPitchSpelling } from "../../domain/harmony/spelling";
import { buildPianoKeyboardLayout, normalizeChordPitches } from "./pianoKeyboard";
import type { PianoKeyboardKey } from "./pianoKeyboard";

function formatChordPitch(pitch: ExactPitch): string {
  return `${formatPitchSpelling(pitch.spelling)}${pitch.octave}`;
}

function keyClassName(key: PianoKeyboardKey): string {
  return `mini-key ${key.isBlack ? "mini-black-key" : "mini-white-key"}${key.isActive ? " is-active is-pressed" : ""}`;
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
  chordLabel,
}: {
  readonly chordPitches: readonly ExactPitch[];
  readonly chordLabel: string;
}) {
  const normalizedPitches = normalizeChordPitches(chordPitches);
  const layout = buildPianoKeyboardLayout(normalizedPitches);
  const noteLabel = normalizedPitches.map(formatChordPitch).join(", ");
  const pitchByMidi = new Map(normalizedPitches.map((pitch) => [pitch.midiNumber, pitch]));
  const chordOctave = normalizedPitches[0]?.octave ?? 4;

  return (
    <div className="mini-piano-card-visual">
      <div className="mini-piano-heading">
        <strong className="mini-piano-chord-name">{chordLabel}</strong>
        <span className="mini-piano-octave" aria-label={`Chord starts in octave ${chordOctave}`}>
          {`Oct ${chordOctave}`}
        </span>
      </div>
      <div
        className="mini-piano"
        role="img"
        aria-label={`${chordLabel} chord on piano: ${noteLabel || "none"}`}
        data-start-midi={layout.startMidi}
        data-end-midi={layout.endMidiExclusive - 1}
      >
        <div className="mini-piano-white-layer" aria-hidden="true">
          {layout.whiteKeys.map((key) => (
            <span
              key={key.midi}
              className={keyClassName(key)}
              data-midi={key.midi}
              data-active={key.isActive ? "true" : "false"}
              data-pressed={key.isActive ? "true" : "false"}
            />
          ))}
        </div>
        <div className="mini-piano-black-layer" aria-hidden="true">
          {layout.blackKeys.map((key) => (
            <span
              key={key.midi}
              className={keyClassName(key)}
              data-midi={key.midi}
              data-active={key.isActive ? "true" : "false"}
              data-pressed={key.isActive ? "true" : "false"}
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
    </div>
  );
}
