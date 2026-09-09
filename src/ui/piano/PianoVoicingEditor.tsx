import { useState } from "react";
import {
  exactPitch,
  midiToPitchClass,
  type ExactPitch,
  type PitchSpelling,
} from "../../domain/harmony/pitch";
import { validateManualVoicing } from "../../instruments/piano/voicing";
import { PIANO_RANGE_MAX_MIDI, PIANO_RANGE_MIN_MIDI } from "../../instruments/contracts";
import { useModalFocus } from "../common/useModalFocus";

export interface PianoVoicingEditorProps {
  readonly initialPitches: readonly ExactPitch[];
  readonly stepLabel: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSave: (pitches: readonly ExactPitch[]) => void;
  readonly onResetToAuto: () => void;
}

const PC_TO_DEFAULT_SPELLING: Readonly<Record<number, PitchSpelling>> = {
  0: { step: "C", alter: 0 },
  1: { step: "C", alter: 1 },
  2: { step: "D", alter: 0 },
  3: { step: "E", alter: -1 },
  4: { step: "E", alter: 0 },
  5: { step: "F", alter: 0 },
  6: { step: "F", alter: 1 },
  7: { step: "G", alter: 0 },
  8: { step: "A", alter: -1 },
  9: { step: "A", alter: 0 },
  10: { step: "B", alter: -1 },
  11: { step: "B", alter: 0 },
};

function formatPitchName(pitch: ExactPitch): string {
  const alterStr = pitch.spelling.alter === 1 ? "#" : pitch.spelling.alter === -1 ? "b" : "";
  return `${pitch.spelling.step}${alterStr}${pitch.octave} (MIDI ${pitch.midiNumber})`;
}

export function PianoVoicingEditor({
  initialPitches,
  stepLabel,
  isOpen,
  onClose,
  onSave,
  onResetToAuto,
}: PianoVoicingEditorProps) {
  const [pitches, setPitches] = useState<readonly ExactPitch[]>(initialPitches);
  const [newMidi, setNewMidi] = useState<number>(60);
  const dialogRef = useModalFocus<HTMLDivElement>({ isOpen, onClose });

  if (!isOpen) return null;

  const validation = validateManualVoicing(pitches);

  const handleAddNote = () => {
    if (newMidi < PIANO_RANGE_MIN_MIDI || newMidi > PIANO_RANGE_MAX_MIDI) return;
    const pc = midiToPitchClass(newMidi);
    const spelling = PC_TO_DEFAULT_SPELLING[pc] ?? { step: "C", alter: 0 };
    const newPitch = exactPitch(newMidi, spelling);
    const updated = [...pitches, newPitch].sort((a, b) => a.midiNumber - b.midiNumber);
    setPitches(updated);
  };

  const handleRemoveNote = (index: number) => {
    const updated = pitches.filter((_, i) => i !== index);
    setPitches(updated);
  };

  const handleMidiChange = (index: number, nextMidi: number) => {
    if (isNaN(nextMidi)) return;
    const pc = midiToPitchClass(Math.max(0, Math.min(127, nextMidi)));
    const spelling = PC_TO_DEFAULT_SPELLING[pc] ?? { step: "C", alter: 0 };
    const nextPitch = exactPitch(nextMidi, spelling);
    const updated = pitches.map((p, i) => (i === index ? nextPitch : p));
    setPitches(updated);
  };

  const handleTranspose = (semitones: number) => {
    const updated = pitches.map((p) => {
      const targetMidi = Math.max(0, Math.min(127, p.midiNumber + semitones));
      const pc = midiToPitchClass(targetMidi);
      const spelling = PC_TO_DEFAULT_SPELLING[pc] ?? p.spelling;
      return exactPitch(targetMidi, spelling);
    });
    setPitches(updated);
  };

  const handleSave = () => {
    if (!validation.valid) return;
    onSave(pitches);
    onClose();
  };

  return (
    <div
      className="piano-voicing-editor-modal"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Manual Piano Voicing Editor for ${stepLabel}`}
    >
      <div className="voicing-editor-card">
        <header className="voicing-editor-header">
          <h3>Manual Piano Voicing Editor: {stepLabel}</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close editor">
            ✕
          </button>
        </header>

        <section className="voicing-notes-list" aria-label="Current exact pitches">
          <h4>Active Notes ({pitches.length})</h4>
          {pitches.length === 0 ? (
            <p className="empty-warning" role="alert">
              No notes in voicing. Manual voicings must contain at least one note.
            </p>
          ) : (
            <ul>
              {pitches.map((pitch, idx) => (
                <li key={`${pitch.midiNumber}-${idx}`} className="note-row">
                  <span className="note-name">{formatPitchName(pitch)}</span>
                  <label>
                    MIDI:
                    <input
                      type="number"
                      min={PIANO_RANGE_MIN_MIDI}
                      max={PIANO_RANGE_MAX_MIDI}
                      value={pitch.midiNumber}
                      onChange={(e) => handleMidiChange(idx, Number(e.target.value))}
                      aria-label={`MIDI note for pitch ${idx + 1}`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => handleRemoveNote(idx)}
                    aria-label={`Remove note ${formatPitchName(pitch)}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="add-note-controls" aria-label="Add note to voicing">
          <label>
            Add MIDI note (21..108):
            <input
              type="number"
              min={PIANO_RANGE_MIN_MIDI}
              max={PIANO_RANGE_MAX_MIDI}
              value={newMidi}
              onChange={(e) => setNewMidi(Number(e.target.value))}
            />
          </label>
          <button type="button" onClick={handleAddNote}>
            Add Note
          </button>
        </section>

        <section className="transpose-controls" aria-label="Explicit transposition">
          <span>Transpose manual voicing: </span>
          <button type="button" onClick={() => handleTranspose(-12)}>
            -1 Octave
          </button>
          <button type="button" onClick={() => handleTranspose(-1)}>
            -1 Semitone
          </button>
          <button type="button" onClick={() => handleTranspose(1)}>
            +1 Semitone
          </button>
          <button type="button" onClick={() => handleTranspose(12)}>
            +1 Octave
          </button>
        </section>

        {!validation.valid && (
          <div className="validation-error-box" role="alert">
            {validation.messages.map((msg, i) => (
              <p key={i} className="error-text">
                {msg}
              </p>
            ))}
          </div>
        )}

        <footer className="voicing-editor-actions">
          <button type="button" onClick={onResetToAuto}>
            Switch to Auto Voicing
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={!validation.valid}
            onClick={handleSave}
          >
            Apply Manual Voicing
          </button>
        </footer>
      </div>
    </div>
  );
}
