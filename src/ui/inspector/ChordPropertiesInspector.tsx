import { useState, type ChangeEvent } from "react";
import type {
  ChordPropertiesEdit,
  ChordQualityControl,
} from "../../domain/progression/chordProperties";
import {
  borrowedModeForFunction,
  chordDegreeForFunction,
  chordQualityForControl,
  chordTypeForDefinition,
  SECONDARY_FUNCTION_CHOICES,
  secondaryChoiceForFunction,
  seventhForDefinition,
} from "../../domain/progression/chordProperties";
import {
  effectiveChordQuality,
  formatChordSymbol,
  withHarmonicVariant,
} from "../../domain/harmony/chord";
import { realizeChord } from "../../domain/harmony/realization";
import { resolveChordTones } from "../../domain/harmony/chordTones";
import { computeModalChords } from "../../domain/harmony/modes";
import { harmonicFunctionLabel, type BorrowedModeId } from "../../domain/harmony/functions";
import type { HarmonicContext } from "../../domain/harmony/modules/types";
import { exactPitch, midiToPitchClass, type PitchSpelling } from "../../domain/harmony/pitch";
import { formatPitchSpelling } from "../../domain/harmony/spelling";
import type {
  BassChoice,
  BassOctaveOffset,
  BassSettings,
  ChordStep,
} from "../../domain/progression/step";
import { pitchToConcertFrame, pitchToSourceFrame } from "../../domain/progression/transposition";
import { realizeProgressionStepRealization } from "../../instruments/piano/profile";
import type { SeventhKind, Suspension } from "../../domain/harmony/chord";
import { PIANO_RANGE_MAX_MIDI, PIANO_RANGE_MIN_MIDI } from "../../instruments/contracts";

const QUALITY_OPTIONS: readonly { readonly value: ChordQualityControl; readonly label: string }[] =
  [
    { value: "major", label: "Major" },
    { value: "minor", label: "Minor" },
    { value: "diminished", label: "Diminished" },
    { value: "augmented", label: "Augmented" },
  ];

const SEVENTH_LABELS: Readonly<Record<SeventhKind, string>> = {
  minor7: "Minor seventh",
  major7: "Major seventh",
  diminished7: "Diminished seventh",
  "half-diminished7": "Half-diminished seventh",
};

const MODES: readonly { readonly value: BorrowedModeId; readonly label: string }[] = [
  { value: "ionian", label: "Ionian" },
  { value: "dorian", label: "Dorian" },
  { value: "phrygian", label: "Phrygian" },
  { value: "lydian", label: "Lydian" },
  { value: "mixolydian", label: "Mixolydian" },
  { value: "aeolian", label: "Aeolian" },
  { value: "locrian", label: "Locrian" },
];

const PITCH_SPELLINGS: Readonly<Record<number, PitchSpelling>> = {
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

const BASS_CHOICE_LABELS: Readonly<Record<BassChoice, string>> = {
  auto: "Auto",
  root: "Root",
  second: "2nd",
  third: "3rd",
  fourth: "4th",
  fifth: "5th",
  seventh: "7th",
  ninth: "9th",
  eleventh: "11th",
  thirteenth: "13th",
  custom: "Custom pitch",
};

function inversionLabel(index: number, degree: number): string {
  if (index === 0) return `Root position (degree ${degree})`;
  const ordinal = index === 1 ? "1st" : index === 2 ? "2nd" : index === 3 ? "3rd" : `${index}th`;
  return `${ordinal} inversion (degree ${degree})`;
}

export interface ChordPropertiesInspectorProps {
  readonly step: ChordStep;
  readonly tonic: number;
  readonly context: HarmonicContext;
  readonly independentBassEnabled?: boolean;
  readonly onEdit: (edit: ChordPropertiesEdit) => void;
}

export function ChordPropertiesInspector({
  step,
  tonic,
  context,
  independentBassEnabled = false,
  onEdit,
}: ChordPropertiesInspectorProps) {
  const [customBassError, setCustomBassError] = useState<string | null>(null);
  const chord = withHarmonicVariant(
    realizeChord(step.harmonicFunction, tonic),
    step.harmonicVariant,
  );
  const tones = resolveChordTones(chord);
  const realization = realizeProgressionStepRealization(step, tonic, context);
  const type = chordTypeForDefinition(chord);
  const quality = chordQualityForControl(chord);
  const seventh = seventhForDefinition(chord);
  const secondaryChoice = secondaryChoiceForFunction(step.harmonicFunction);
  const borrowedMode = borrowedModeForFunction(step.harmonicFunction);
  const degree = chordDegreeForFunction(step.harmonicFunction);
  const hasUnsupportedSecondary =
    !secondaryChoice &&
    (step.harmonicFunction.category === "secondary-dominant" ||
      step.harmonicFunction.category === "secondary-diminished");
  const secondaryValue = secondaryChoice
    ? `${secondaryChoice.kind}:${secondaryChoice.targetFunctionId}`
    : hasUnsupportedSecondary
      ? "unavailable"
      : "none";
  const canUseAutomaticInversions =
    step.performance.voicingMode !== "manual" && step.performance.bass.choice !== "custom";
  const currentInversion = step.performance.inversion ?? "auto";
  const inversionUnavailable = currentInversion !== "auto" && currentInversion >= tones.length;
  const inversionValue = inversionUnavailable ? "unavailable" : currentInversion;
  const bassChoice = step.performance.bass.choice;
  const hasSuspension = step.harmonicVariant.suspensions.length > 0;
  const fifthAltered = step.harmonicVariant.alterations.some((item) => item.degree === 5);
  const manualVoicing = step.performance.voicingMode === "manual";
  const diminishedBorrowModes = new Set(
    degree === undefined
      ? []
      : MODES.filter((mode) => {
          const borrowedChord = computeModalChords(tonic, mode.value).find(
            (item) => item.degree === degree,
          )?.chord;
          return (
            borrowedChord !== undefined && effectiveChordQuality(borrowedChord) === "diminished"
          );
        }).map((mode) => mode.value),
  );
  const bassChoiceOptions: readonly BassChoice[] = [
    "auto",
    ...tones
      .map((tone) => tone.diatonicDegree)
      .filter((toneDegree) => toneDegree !== 1)
      .map((toneDegree) => {
        switch (toneDegree) {
          case 2:
            return "second" as const;
          case 3:
            return "third" as const;
          case 4:
            return "fourth" as const;
          case 5:
            return "fifth" as const;
          case 7:
            return "seventh" as const;
          case 9:
            return "ninth" as const;
          case 11:
            return "eleventh" as const;
          case 13:
            return "thirteenth" as const;
          default:
            return undefined;
        }
      })
      .filter(
        (choice): choice is Exclude<BassChoice, "auto" | "root" | "custom"> => choice !== undefined,
      ),
    "root",
    "custom",
  ];
  const functionLabel = harmonicFunctionLabel(step.harmonicFunction);
  const noteSummary = realization.pitches
    .map((pitch) => `${formatPitchSpelling(pitch.spelling)}${pitch.octave}`)
    .join(" · ");
  const bassSummary = realization.bassPitch
    ? `${formatPitchSpelling(realization.bassPitch.spelling)}${realization.bassPitch.octave}`
    : "—";

  const emitBass = (bass: BassSettings) => onEdit({ type: "bass", value: bass });
  const handleBassChoice = (event: ChangeEvent<HTMLSelectElement>) => {
    const choice = event.target.value as BassChoice;
    const bass = step.performance.bass;
    if (choice === "custom") {
      const customPitch =
        bass.customPitch ?? pitchToSourceFrame(exactPitch(36, { step: "C", alter: 0 }), step);
      emitBass({ ...bass, choice, customPitch });
    } else {
      const { customPitch: _customPitch, ...withoutCustom } = bass;
      emitBass({ ...withoutCustom, choice });
    }
  };
  const handleBassOctave = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    emitBass({
      ...step.performance.bass,
      octaveOffset: value === "auto" ? "auto" : (Number(value) as BassOctaveOffset),
    });
  };
  const handleCustomBass = (rawMidi: number) => {
    if (!Number.isInteger(rawMidi)) return;
    if (rawMidi < PIANO_RANGE_MIN_MIDI || rawMidi > PIANO_RANGE_MAX_MIDI) {
      setCustomBassError(
        `Choose a MIDI pitch in ${PIANO_RANGE_MIN_MIDI}..${PIANO_RANGE_MAX_MIDI}.`,
      );
      return;
    }
    setCustomBassError(null);
    const pitchClass = midiToPitchClass(rawMidi);
    const pitch = pitchToSourceFrame(
      exactPitch(rawMidi, PITCH_SPELLINGS[pitchClass] ?? { step: "C", alter: 0 }),
      step,
    );
    emitBass({ ...step.performance.bass, choice: "custom", customPitch: pitch });
  };

  return (
    <section
      className="chord-properties-inspector"
      aria-label="Chord Properties"
      data-testid="chord-properties-inspector"
    >
      <header className="chord-properties-header">
        <div>
          <h3>Chord Properties</h3>
          <span className="chord-properties-symbol" data-testid="chord-properties-symbol">
            {formatChordSymbol(chord)}
          </span>
          <p className="chord-properties-function">{functionLabel}</p>
        </div>
        <button
          type="button"
          className="chord-properties-reset"
          disabled={!step.chordPropertiesOrigin}
          onClick={() => onEdit({ type: "reset" })}
          title="Restore properties before first Chord Properties edit (in current key)"
          aria-label="Reset chord properties"
          data-testid="chord-properties-reset"
        >
          Reset
        </button>
      </header>

      <p className="chord-properties-sounding" data-testid="chord-properties-sounding">
        <span>Notes</span> {noteSummary || "No sounding notes"}
        <span className="chord-properties-bass">
          {independentBassEnabled
            ? `Independent bass ${bassSummary}`
            : `Independent bass off · saved ${bassSummary}`}
        </span>
      </p>

      <div className="chord-properties-grid">
        <div className="chord-properties-field">
          <span id="chord-properties-type-label">Type</span>
          <div
            role="group"
            aria-labelledby="chord-properties-type-label"
            aria-label="Chord type"
            data-testid="chord-properties-type"
            className="chord-properties-type-segmented"
          >
            {(["triad", "7", "9", "11", "13"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={type === value}
                aria-label={value === "triad" ? "Triad" : value}
                data-testid={`chord-properties-type-${value}`}
                disabled={manualVoicing}
                onClick={() => onEdit({ type: "type", value })}
              >
                {value === "triad" ? "Triad" : value}
              </button>
            ))}
          </div>
          <small>9 adds a seventh and ninth; 11 adds 9/11; 13 adds 9/11/13.</small>
        </div>

        <label className="chord-properties-field">
          <span>Quality</span>
          <select
            aria-label="Chord quality"
            data-testid="chord-properties-quality"
            value={quality}
            disabled={manualVoicing}
            onChange={(event) =>
              onEdit({ type: "quality", value: event.target.value as ChordQualityControl })
            }
          >
            {QUALITY_OPTIONS.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.value === "diminished" && hasSuspension}
              >
                {option.label}
              </option>
            ))}
          </select>
          {hasSuspension && <small>Clear sus2/sus4 before choosing Diminished quality.</small>}
        </label>

        <label className="chord-properties-field">
          <span>Seventh</span>
          <select
            aria-label="Seventh quality"
            data-testid="chord-properties-seventh"
            value={type === "triad" ? "none" : (seventh ?? "none")}
            disabled={manualVoicing}
            onChange={(event) => {
              if (event.target.value === "none") onEdit({ type: "type", value: "triad" });
              else onEdit({ type: "seventh", value: event.target.value as SeventhKind });
            }}
          >
            <option value="none">None (triad)</option>
            {(effectiveChordQuality(chord) === "diminished"
              ? (["minor7", "half-diminished7", "diminished7", "major7"] as const)
              : (["minor7", "major7"] as const)
            ).map((value) => (
              <option key={value} value={value}>
                {SEVENTH_LABELS[value]}
              </option>
            ))}
          </select>
          {effectiveChordQuality(chord) !== "diminished" && (
            <small>Diminished and half-diminished sevenths require diminished quality.</small>
          )}
        </label>

        <label className="chord-properties-field">
          <span>Inversion</span>
          <select
            aria-label="Chord inversion"
            data-testid="chord-properties-inversion"
            value={inversionValue}
            disabled={!canUseAutomaticInversions}
            title={
              !canUseAutomaticInversions
                ? step.performance.voicingMode === "manual"
                  ? "Switch to Auto Voicing to choose an inversion."
                  : "Choose an automatic or chord-tone bass to set an inversion."
                : undefined
            }
            onChange={(event) => {
              const value = event.target.value;
              if (value === "unavailable") return;
              onEdit({
                type: "inversion",
                value: value === "auto" ? "auto" : (Number(value) as 0 | 1 | 2 | 3 | 4 | 5 | 6),
              });
            }}
          >
            <option value="auto">Auto voice leading</option>
            {inversionUnavailable && (
              <option value="unavailable" disabled>
                Previous inversion unavailable
              </option>
            )}
            {tones.slice(0, 7).map((tone, index) => (
              <option key={`${index}-${tone.diatonicDegree}`} value={index}>
                {inversionLabel(index, tone.diatonicDegree)}
              </option>
            ))}
          </select>
          {!canUseAutomaticInversions && (
            <small>
              {step.performance.voicingMode === "manual"
                ? "Manual voicing controls exact notes, so automatic inversions are unavailable."
                : "Custom bass remains independent; choose a chord-tone bass to link it to inversion."}
            </small>
          )}
          {inversionUnavailable && (
            <small>
              The stored inversion has no matching chord tone. Choose Auto or an available
              inversion.
            </small>
          )}
        </label>

        <label className="chord-properties-field">
          <span>Bass Note</span>
          <select
            aria-label="Bass Note"
            data-testid="chord-properties-bass"
            value={bassChoice}
            disabled={!independentBassEnabled}
            onChange={handleBassChoice}
          >
            {bassChoiceOptions.map((choice) => (
              <option key={choice} value={choice}>
                {BASS_CHOICE_LABELS[choice]}
              </option>
            ))}
          </select>
        </label>

        {bassChoice === "custom" ? (
          <label className="chord-properties-field">
            <span>
              Custom bass MIDI ({PIANO_RANGE_MIN_MIDI}–{PIANO_RANGE_MAX_MIDI})
            </span>
            <input
              type="number"
              min={PIANO_RANGE_MIN_MIDI}
              max={PIANO_RANGE_MAX_MIDI}
              aria-label="Custom Bass MIDI number"
              data-testid="chord-properties-custom-bass"
              disabled={!independentBassEnabled}
              value={
                step.performance.bass.customPitch
                  ? pitchToConcertFrame(step.performance.bass.customPitch, step).midiNumber
                  : 36
              }
              onChange={(event) => handleCustomBass(Number(event.target.value))}
            />
            {customBassError && <small role="alert">{customBassError}</small>}
          </label>
        ) : (
          <label className="chord-properties-field">
            <span>Bass Octave</span>
            <select
              aria-label="Bass Octave"
              data-testid="chord-properties-bass-octave"
              value={String(step.performance.bass.octaveOffset)}
              disabled={!independentBassEnabled}
              onChange={handleBassOctave}
            >
              <option value="auto">Auto</option>
              <option value="-1">-1 octave</option>
              <option value="-2">-2 octaves</option>
            </select>
          </label>
        )}
      </div>

      {!independentBassEnabled && (
        <p className="chord-properties-independent-bass-note" role="note">
          Independent bass voice is off. Saved bass choices stay available in Progression settings;
          chord inversions still sound.
        </p>
      )}

      {manualVoicing && (
        <p
          className="chord-properties-manual-note"
          data-testid="chord-properties-manual-note"
          role="note"
        >
          Manual voicing controls the exact sounding notes. Switch to Auto Voicing before changing
          chord tones or function.
        </p>
      )}

      <fieldset className="chord-properties-options" disabled={manualVoicing}>
        <legend>Chord tones</legend>
        <label>
          <span>Suspension</span>
          <select
            aria-label="Suspension"
            data-testid="chord-properties-suspension"
            value={step.harmonicVariant.suspensions[0] ?? "none"}
            disabled={
              effectiveChordQuality(chord) === "diminished" || Boolean(step.harmonicVariant.no3)
            }
            title={
              effectiveChordQuality(chord) === "diminished"
                ? "Suspensions are unavailable on diminished chords."
                : step.harmonicVariant.no3
                  ? "Clear no3 before adding a suspension."
                  : undefined
            }
            onChange={(event) =>
              onEdit({
                type: "suspension",
                value: event.target.value === "none" ? null : (event.target.value as Suspension),
              })
            }
          >
            <option value="none">None</option>
            <option value="sus2">sus2</option>
            <option value="sus4">sus4</option>
          </select>
          {effectiveChordQuality(chord) === "diminished" && (
            <small>Suspensions are unavailable on diminished chords.</small>
          )}
        </label>
        <div className="chord-properties-checks">
          {([9, 11, 13] as const).map((degree) => {
            const isExtension = step.harmonicVariant.extensions.includes(degree);
            const key = degree === 9 ? "add9" : degree === 11 ? "add11" : "add13";
            const checked = step.harmonicVariant[key] === true;
            return (
              <label
                key={degree}
                title={isExtension ? `Type ${degree} already contains this tone.` : undefined}
              >
                <input
                  type="checkbox"
                  aria-label={`Add ${degree}`}
                  data-testid={`chord-properties-add-${degree}`}
                  checked={checked}
                  disabled={isExtension}
                  onChange={(event) =>
                    onEdit({ type: "added-tone", degree, enabled: event.target.checked })
                  }
                />
                add{degree}
              </label>
            );
          })}
        </div>
        {([9, 11, 13] as const).some((degree) =>
          step.harmonicVariant.extensions.includes(degree),
        ) && (
          <small>
            An added tone is disabled when the same degree is already part of the chord type.
          </small>
        )}
        <div className="chord-properties-alterations">
          {([5, 9, 11, 13] as const).map((degree) => {
            const alteration = step.harmonicVariant.alterations.find(
              (item) => item.degree === degree,
            )?.semitones;
            const disabled = degree === 5 && Boolean(step.harmonicVariant.no5);
            return (
              <label key={degree} className="chord-properties-field">
                <span>{degree === 5 ? "Alter fifth" : `Alter ${degree}`}</span>
                <select
                  aria-label={`Alter ${degree}`}
                  data-testid={`chord-properties-alter-${degree}`}
                  value={alteration ?? "natural"}
                  disabled={disabled}
                  title={disabled ? "Clear no5 before altering the fifth." : undefined}
                  onChange={(event) =>
                    onEdit({
                      type: "alteration",
                      degree,
                      semitones:
                        event.target.value === "natural"
                          ? null
                          : (Number(event.target.value) as -1 | 1),
                    })
                  }
                >
                  <option value="natural">Natural</option>
                  <option value="-1">Flat</option>
                  <option value="1">Sharp</option>
                </select>
              </label>
            );
          })}
        </div>
        {step.harmonicVariant.no5 && <small>Clear no5 before altering the fifth.</small>}
        <div className="chord-properties-checks">
          <label title={hasSuspension ? "Clear sus2/sus4 before omitting the third." : undefined}>
            <input
              type="checkbox"
              aria-label="Omit third"
              data-testid="chord-properties-no3"
              checked={step.harmonicVariant.no3 === true}
              disabled={hasSuspension}
              onChange={(event) =>
                onEdit({ type: "omission", degree: 3, enabled: event.target.checked })
              }
            />
            no3
          </label>
          <label
            title={
              fifthAltered ? "Clear the fifth alteration before omitting the fifth." : undefined
            }
          >
            <input
              type="checkbox"
              aria-label="Omit fifth"
              data-testid="chord-properties-no5"
              checked={step.harmonicVariant.no5 === true}
              disabled={fifthAltered}
              onChange={(event) =>
                onEdit({ type: "omission", degree: 5, enabled: event.target.checked })
              }
            />
            no5
          </label>
        </div>
        {hasSuspension && <small>Clear sus2/sus4 before omitting the third.</small>}
        {fifthAltered && <small>Clear the fifth alteration before omitting the fifth.</small>}
      </fieldset>

      <div className="chord-properties-grid chord-properties-functions">
        <label className="chord-properties-field">
          <span>Secondary</span>
          <select
            aria-label="Secondary function"
            data-testid="chord-properties-secondary"
            value={secondaryValue}
            disabled={Boolean(borrowedMode) || manualVoicing}
            title={
              manualVoicing
                ? "Switch to Auto Voicing before changing the harmonic function."
                : borrowedMode
                  ? "Clear Borrow From before setting a secondary function."
                  : hasUnsupportedSecondary
                    ? "This existing secondary function is not one of the supported V/vii targets."
                    : undefined
            }
            onChange={(event) => {
              if (event.target.value === "none") {
                onEdit({ type: "secondary", kind: "none" });
                return;
              }
              const [kind, targetFunctionId] = event.target.value.split(":");
              if ((kind === "dominant" || kind === "diminished") && targetFunctionId) {
                onEdit({ type: "secondary", kind, targetFunctionId });
              }
            }}
          >
            <option value="none">None</option>
            {hasUnsupportedSecondary && (
              <option value="unavailable" disabled>
                Existing secondary (outside V/vii targets)
              </option>
            )}
            {SECONDARY_FUNCTION_CHOICES.map((choice) => (
              <option
                key={`${choice.kind}:${choice.targetFunctionId}`}
                value={`${choice.kind}:${choice.targetFunctionId}`}
              >
                {choice.label}
              </option>
            ))}
          </select>
          {borrowedMode && (
            <small>Secondary functions and modal borrowing are mutually exclusive.</small>
          )}
          {hasUnsupportedSecondary && (
            <small>
              This existing secondary is not a supported V/vii target here. Choose a supported
              target to replace it.
            </small>
          )}
        </label>

        <label className="chord-properties-field">
          <span>Borrow from</span>
          <select
            aria-label="Borrow from mode"
            data-testid="chord-properties-borrow"
            value={borrowedMode ?? "none"}
            disabled={Boolean(secondaryChoice) || !degree || manualVoicing}
            title={
              secondaryChoice
                ? "Clear Secondary before borrowing from a mode."
                : !degree
                  ? "Borrowing requires a supported diatonic degree."
                  : manualVoicing
                    ? "Switch to Auto Voicing before changing the harmonic function."
                    : undefined
            }
            onChange={(event) =>
              onEdit({
                type: "borrow",
                mode: event.target.value === "none" ? null : (event.target.value as BorrowedModeId),
              })
            }
          >
            <option value="none">None</option>
            {MODES.map((mode) => (
              <option
                key={mode.value}
                value={mode.value}
                disabled={hasSuspension && diminishedBorrowModes.has(mode.value)}
              >
                {mode.label}
              </option>
            ))}
          </select>
          {secondaryChoice && <small>Borrow From and Secondary are mutually exclusive.</small>}
          {!degree && !secondaryChoice && (
            <small>This chord has no supported diatonic source degree.</small>
          )}
          {hasSuspension && diminishedBorrowModes.size > 0 && (
            <small>Borrowed diminished chords are unavailable while sus2/sus4 is active.</small>
          )}
        </label>
      </div>
    </section>
  );
}

export function ChordPropertiesUnavailable({ message }: { readonly message: string }) {
  return (
    <section
      className="chord-properties-inspector chord-properties-unavailable"
      aria-label="Chord Properties"
    >
      <header className="chord-properties-header">
        <div>
          <span className="inspector-context-kicker">Chord editing</span>
          <h3>Chord Properties</h3>
        </div>
      </header>
      <p className="chord-properties-function">{message}</p>
    </section>
  );
}
