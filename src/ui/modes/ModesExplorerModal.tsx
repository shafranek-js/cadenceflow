import { useCallback, useMemo, useState, type RefObject } from "react";
import type { PitchClassIdentity } from "../../domain/harmony/pitch";
import type { Project } from "../../domain/project/project";
import {
  CANONICAL_MODAL_FORMULAS,
  computeModalChords,
  computeScalePitches,
  getModalParentKeyAndFunction,
  getScaleDefinition,
  SCALE_DEFINITIONS,
  type ExtendedScaleId,
  type ModalCadenceFormula,
  type ModalChordDefinition,
  type ScaleFamily,
} from "../../domain/harmony/modes";
import { formatPitchSpelling } from "../../domain/harmony/spelling";
import { useModalFocus } from "../common/useModalFocus";
import { Icon } from "../common/Icon";
import { PianoCardView } from "../piano/PianoCardView";
import { GuitarCardView } from "../guitar/GuitarCardView";
import { resolveGuitarChordVoicing } from "../../domain/instruments/guitar/voicings";

const TONIC_PITCH_CLASSES: readonly { pc: PitchClassIdentity; label: string }[] = Object.freeze([
  { pc: 0, label: "C" },
  { pc: 1, label: "D♭" },
  { pc: 2, label: "D" },
  { pc: 3, label: "E♭" },
  { pc: 4, label: "E" },
  { pc: 5, label: "F" },
  { pc: 6, label: "F♯" },
  { pc: 7, label: "G" },
  { pc: 8, label: "A♭" },
  { pc: 9, label: "A" },
  { pc: 10, label: "B♭" },
  { pc: 11, label: "B" },
]);

export interface ModesExplorerModalProps {
  readonly isOpen: boolean;
  readonly project: Project;
  readonly restoreFocusRef?: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onAuditionScaleNotes?: (
    pitches: readonly { midiNumber: number }[],
    instrument?: "piano" | "guitar",
  ) => void;
  readonly onAuditionChord?: (
    pitches: readonly { midiNumber: number }[],
    instrument?: "piano" | "guitar",
  ) => void;
  readonly onAuditionFormula?: (
    formula: ModalCadenceFormula,
    tonic: PitchClassIdentity,
    instrument?: "piano" | "guitar",
  ) => void;
  readonly onStopAudition?: () => void;
  readonly onApplyFormulaToProgression?: (
    formula: ModalCadenceFormula,
    tonic: PitchClassIdentity,
    switchKey: boolean,
  ) => ModalFormulaApplyResult | void;
  readonly onApplyKeyToProject?: (tonic: PitchClassIdentity) => void;
}

export type ModalFormulaApplyResult =
  { readonly success: true } | { readonly success: false; readonly reason: string };

export function ModesExplorerModal({
  isOpen,
  project,
  restoreFocusRef,
  onClose,
  onAuditionScaleNotes,
  onAuditionChord,
  onAuditionFormula,
  onStopAudition: _onStopAudition,
  onApplyFormulaToProgression,
  onApplyKeyToProject,
}: ModesExplorerModalProps) {
  const dialogRef = useModalFocus<HTMLDivElement>({
    isOpen,
    isTopmost: true,
    onClose,
    ...(restoreFocusRef ? { restoreFocusRef } : {}),
  });

  const [selectedTonic, setSelectedTonic] = useState<PitchClassIdentity>(project.tonic);
  const [activeFamily, setActiveFamily] = useState<ScaleFamily>("diatonic");
  const [selectedScaleId, setSelectedScaleId] = useState<ExtendedScaleId>("dorian");
  const [cardVisualView, setCardVisualView] = useState<"piano" | "guitar">("piano");
  const [switchKeyOnApply, setSwitchKeyOnApply] = useState<boolean>(true);
  const [applyError, setApplyError] = useState<
    { readonly formulaId: string; readonly reason: string; readonly canSwitch: boolean } | undefined
  >();

  const scaleDef = useMemo(() => getScaleDefinition(selectedScaleId), [selectedScaleId]);

  const filteredScales = useMemo(() => {
    return SCALE_DEFINITIONS.filter((s) => s.family === activeFamily);
  }, [activeFamily]);

  const scalePitches = useMemo(() => {
    return computeScalePitches(selectedTonic, selectedScaleId);
  }, [selectedTonic, selectedScaleId]);

  const scalePitchClasses = useMemo(() => {
    return scalePitches.map((p) => p.pitchClass);
  }, [scalePitches]);

  const modalChords = useMemo(() => {
    return computeModalChords(selectedTonic, selectedScaleId);
  }, [selectedTonic, selectedScaleId]);

  const modalFormulas = useMemo(() => {
    return CANONICAL_MODAL_FORMULAS.filter((f) => f.modeId === selectedScaleId);
  }, [selectedScaleId]);

  const currentTonicLabel = TONIC_PITCH_CLASSES.find((t) => t.pc === selectedTonic)?.label ?? "C";
  const parentTonic = useMemo(
    () => getModalParentKeyAndFunction(selectedTonic, selectedScaleId, 1).parentTonic,
    [selectedTonic, selectedScaleId],
  );
  const parentTonicLabel = TONIC_PITCH_CLASSES.find((t) => t.pc === parentTonic)?.label ?? "C";
  const projectTonicLabel = TONIC_PITCH_CLASSES.find((t) => t.pc === project.tonic)?.label ?? "C";

  // Audio audition for scale notes
  const handlePlayScale = useCallback(() => {
    if (!onAuditionScaleNotes) return;
    const baseMidi = cardVisualView === "guitar" ? 48 + selectedTonic : 60 + selectedTonic;
    const pitches = scalePitches.map((p) => ({
      midiNumber: baseMidi + p.intervalFromTonic,
    }));
    // Add octave return at the end
    pitches.push({ midiNumber: baseMidi + 12 });
    onAuditionScaleNotes(pitches, cardVisualView);
  }, [onAuditionScaleNotes, scalePitches, selectedTonic, cardVisualView]);

  const handlePlayChord = useCallback(
    (chordDef: ModalChordDefinition) => {
      if (!onAuditionChord) return;
      if (cardVisualView === "guitar") {
        const voicing = resolveGuitarChordVoicing(chordDef.chord);
        if (voicing.unsupportedReason) return;
        const pitches = voicing.pitches.map((p) => ({ midiNumber: p.midiNumber }));
        onAuditionChord(pitches, "guitar");
      } else {
        const pitches = chordDef.pitches.map((p) => ({ midiNumber: p.midiNumber }));
        onAuditionChord(pitches, "piano");
      }
    },
    [onAuditionChord, cardVisualView],
  );

  const handleApplyFormula = useCallback(
    (formula: ModalCadenceFormula, useSwitchKey = switchKeyOnApply) => {
      if (!onApplyFormulaToProgression) return;
      const formulaParentTonic = getModalParentKeyAndFunction(
        selectedTonic,
        formula.modeId,
        1,
      ).parentTonic;
      if (!useSwitchKey && project.tonic !== formulaParentTonic) {
        const formulaParentLabel =
          TONIC_PITCH_CLASSES.find((tonic) => tonic.pc === formulaParentTonic)?.label ?? "C";
        setApplyError({
          formulaId: formula.id,
          canSwitch: true,
          reason: `This formula is derived from ${formulaParentLabel} major, but the project key is ${projectTonicLabel}. Switch the project key to ${formulaParentLabel} to preserve the selected pitches.`,
        });
        return;
      }

      const result = onApplyFormulaToProgression(formula, selectedTonic, useSwitchKey);
      if (result && !result.success) {
        setApplyError({
          formulaId: formula.id,
          canSwitch: !useSwitchKey && project.tonic !== formulaParentTonic,
          reason: result.reason,
        });
        return;
      }
      setApplyError(undefined);
      onClose();
    },
    [
      onApplyFormulaToProgression,
      selectedTonic,
      switchKeyOnApply,
      project.tonic,
      projectTonicLabel,
      onClose,
    ],
  );

  const handleSwitchAndApplyFormula = useCallback(
    (formula: ModalCadenceFormula) => handleApplyFormula(formula, true),
    [handleApplyFormula],
  );

  const handleApplyKey = useCallback(() => {
    if (!onApplyKeyToProject) return;
    // For diatonic modes, compute the parent major tonic so Matrix remains in tune
    const { parentTonic } = getModalParentKeyAndFunction(selectedTonic, selectedScaleId, 1);
    onApplyKeyToProject(parentTonic);
    onClose();
  }, [onApplyKeyToProject, selectedTonic, selectedScaleId, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop modes-explorer-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="modal-card modes-explorer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modes-modal-title"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="modal-header modes-header">
          <div className="modes-title-group">
            <h2 id="modes-modal-title" className="modes-title">
              <span className="modes-title-icon" aria-hidden="true">
                🎼
              </span>
              Scales &amp; Modes Explorer
            </h2>
            <span className="modes-current-key-badge">
              Active:{" "}
              <strong>
                {currentTonicLabel} {scaleDef.name}
              </strong>
            </span>
          </div>
          <button
            type="button"
            className="modal-close-button"
            aria-label="Close Scales & Modes Explorer"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Modal 2-Column Split Body */}
        <div className="modes-content-body">
          {/* Left Column: Scale controls, details & Diatonic chords */}
          <div className="modes-content-left">
            {/* 2D State Machine: Axis 1 (Tonic) */}
            <section className="modes-tonic-section" aria-label="Tonic Root Selection">
              <div className="modes-section-label">
                <span>1. TONIC ROOT (Горизонтальный слайдер тоники)</span>
              </div>
              <div className="modes-tonic-pills" role="radiogroup" aria-label="Tonic pitch class">
                {TONIC_PITCH_CLASSES.map((item) => {
                  const isSelected = item.pc === selectedTonic;
                  return (
                    <button
                      key={item.pc}
                      type="button"
                      className={`modes-tonic-pill ${isSelected ? "is-active" : ""}`}
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => {
                        setSelectedTonic(item.pc);
                        setApplyError(undefined);
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 2D State Machine: Axis 2 (Family & Mode Selector) */}
            <section className="modes-family-section" aria-label="Mode Family Selection">
              <div className="modes-section-label">
                <span>2. SCALE FAMILY & MODE (Вертикальный слайдер лада)</span>
              </div>
              <div className="modes-family-tabs" role="tablist">
                <button
                  type="button"
                  className={`modes-tab-btn ${activeFamily === "diatonic" ? "is-active" : ""}`}
                  role="tab"
                  aria-selected={activeFamily === "diatonic"}
                  onClick={() => {
                    setActiveFamily("diatonic");
                    setSelectedScaleId("dorian");
                    setApplyError(undefined);
                  }}
                >
                  7 Diatonic Church Modes
                </button>
                <button
                  type="button"
                  className={`modes-tab-btn ${activeFamily === "minor-variants" ? "is-active" : ""}`}
                  role="tab"
                  aria-selected={activeFamily === "minor-variants"}
                  onClick={() => {
                    setActiveFamily("minor-variants");
                    setSelectedScaleId("harmonic-minor");
                    setApplyError(undefined);
                  }}
                >
                  Minor Variants (Harmonic & Melodic)
                </button>
                <button
                  type="button"
                  className={`modes-tab-btn ${activeFamily === "pentatonic-blues" ? "is-active" : ""}`}
                  role="tab"
                  aria-selected={activeFamily === "pentatonic-blues"}
                  onClick={() => {
                    setActiveFamily("pentatonic-blues");
                    setSelectedScaleId("blues");
                    setApplyError(undefined);
                  }}
                >
                  Pentatonic & Blues
                </button>
              </div>

              <div className="modes-pills" role="radiogroup" aria-label="Select scale">
                {filteredScales.map((scale) => {
                  const isSelected = scale.id === selectedScaleId;
                  return (
                    <button
                      key={scale.id}
                      type="button"
                      className={`modes-scale-pill ${isSelected ? "is-active" : ""}`}
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => {
                        setSelectedScaleId(scale.id);
                        setApplyError(undefined);
                      }}
                    >
                      <span className="pill-name">{scale.name}</span>
                      {scale.characteristicInterval && (
                        <span className="pill-characteristic">{scale.characteristicInterval}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Scale Details & Characteristic Banner */}
            <section className="modes-details-banner" aria-label="Scale Characteristics">
              <div className="modes-banner-header">
                <div className="modes-banner-header-left">
                  <h3 className="modes-banner-title">
                    {currentTonicLabel} {scaleDef.name}
                  </h3>
                  <div className="modes-banner-formula">
                    <span className="formula-badge">{scaleDef.formulaTextRu}</span>
                    <span className="formula-en">({scaleDef.formulaTextEn})</span>
                  </div>
                </div>
                <div className="modes-banner-actions">
                  <button
                    type="button"
                    className="modes-play-scale-btn"
                    onClick={handlePlayScale}
                    title="Play scale ascending and descending"
                  >
                    <span className="play-icon" aria-hidden="true">
                      ▶
                    </span>
                    <span>Play Scale</span>
                  </button>
                </div>
              </div>

              <p className="modes-banner-desc">{scaleDef.characterRu}</p>

              {scaleDef.characteristicInterval && (
                <div className="modes-characteristic-callout">
                  <span className="callout-star" aria-hidden="true">
                    ★
                  </span>
                  <div className="callout-body">
                    <strong>Характерный признак лада ({scaleDef.characteristicInterval}):</strong>{" "}
                    <span>{scaleDef.characteristicDescriptionRu}</span>
                  </div>
                </div>
              )}

              <div className="modes-genre-tags">
                <span className="genre-label">Стили и примеры:</span>
                {scaleDef.genreExamples.map((genre) => (
                  <span key={genre} className="genre-pill">
                    {genre}
                  </span>
                ))}
              </div>
            </section>

            {/* Scale Degrees & Pitch Representation */}
            <section className="modes-scale-pitches" aria-label="Scale notes">
              <div className="modes-pitches-list">
                {scalePitches.map((p) => {
                  const noteName = formatPitchSpelling(p.spelling);
                  return (
                    <div
                      key={p.degree}
                      className={`modes-pitch-item ${p.isCharacteristic ? "is-characteristic" : ""}`}
                    >
                      <span className="degree-num">{p.degree}</span>
                      <strong className="pitch-name">{noteName}</strong>
                      <span className="semitone-offset">+{p.intervalFromTonic}st</span>
                      {p.isCharacteristic && <span className="char-badge">★ Char</span>}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Modal Chords Strip (7 Diatonic Chords) */}
            {modalChords.length > 0 && (
              <section className="modes-chords-section" aria-label="Modal Diatonic Chords">
                <div className="modes-chords-header">
                  <div className="chords-title-group">
                    <h4>
                      {activeFamily === "pentatonic-blues"
                        ? "Характерные аккорды строя"
                        : "Диатонические аккорды лада"}
                    </h4>
                    <span className="chords-subtitle">
                      Кликните на карточку для аудио-прослушивания
                    </span>
                  </div>
                  <div className="modes-view-toggle">
                    <button
                      type="button"
                      className={`view-btn ${cardVisualView === "piano" ? "is-active" : ""}`}
                      onClick={() => setCardVisualView("piano")}
                      title="Piano Keyboard View"
                    >
                      Piano [P]
                    </button>
                    <button
                      type="button"
                      className={`view-btn ${cardVisualView === "guitar" ? "is-active" : ""}`}
                      onClick={() => setCardVisualView("guitar")}
                      title="Guitar Fretboard View"
                    >
                      Guitar [G]
                    </button>
                  </div>
                </div>

                <div className="modes-chords-strip">
                  {modalChords.map((chordDef) => {
                    return (
                      <button
                        key={chordDef.degree}
                        type="button"
                        className={`modal-chord-card ${chordDef.isCharacteristicChord ? "is-characteristic-chord" : ""}`}
                        onClick={() => handlePlayChord(chordDef)}
                        title={`Click to play ${chordDef.chordSymbol}`}
                      >
                        <div className="modal-chord-top">
                          <strong className="modal-chord-numeral">{chordDef.romanNumeral}</strong>
                          <span className="modal-chord-symbol">{chordDef.chordSymbol}</span>
                        </div>

                        {chordDef.isCharacteristicChord && (
                          <span className="modal-chord-badge">★ Modal</span>
                        )}

                        <div className="modal-chord-visual">
                          {cardVisualView === "piano" ? (
                            <PianoCardView
                              chordPitches={chordDef.pitches}
                              chordLabel={chordDef.chordSymbol}
                            />
                          ) : (
                            <GuitarCardView
                              chord={chordDef.chord}
                              chordLabel={chordDef.chordSymbol}
                              scalePitchClasses={scalePitchClasses}
                              showScaleTones={true}
                            />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* Right Column: Canonical Modal Cadences & Progressions */}
          <div className="modes-content-right">
            <section className="modes-formulas-section" aria-label="Modal Cadence Formulas">
              <div className="modes-formulas-header">
                <h4 className="formulas-title">
                  <span className="formulas-icon" aria-hidden="true">
                    ⚡
                  </span>
                  Канонические каденции и ходы
                </h4>
                {modalFormulas.length > 0 && (
                  <span className="formulas-count-badge">{modalFormulas.length}</span>
                )}
              </div>

              {modalFormulas.length > 0 ? (
                <div className="modes-formulas-list">
                  {modalFormulas.map((formula) => {
                    return (
                      <div key={formula.id} className="modes-formula-card">
                        <div className="formula-header">
                          <div className="formula-title-row">
                            <strong>{formula.title}</strong>
                            <span className="formula-genre-badge">{formula.genreTag}</span>
                          </div>
                          <span className="formula-roman">{formula.romanProgression}</span>
                        </div>
                        <p className="formula-description">{formula.description}</p>
                        <div className="formula-actions">
                          {onAuditionFormula && (
                            <button
                              type="button"
                              className="formula-audition-btn"
                              onClick={() =>
                                onAuditionFormula(formula, selectedTonic, cardVisualView)
                              }
                              title="Audition progression audio"
                            >
                              <span aria-hidden="true">▶</span> Play
                            </button>
                          )}
                          <button
                            type="button"
                            className="formula-apply-btn"
                            onClick={() => handleApplyFormula(formula)}
                            title="Apply this progression to My Progression"
                          >
                            <span aria-hidden="true">➕</span> Apply to Progression
                          </button>
                        </div>
                        {applyError?.formulaId === formula.id ? (
                          <div className="modes-formula-apply-error" role="alert">
                            <p>{applyError.reason}</p>
                            {applyError.canSwitch ? (
                              <button
                                type="button"
                                className="modes-switch-and-apply-button"
                                onClick={() => handleSwitchAndApplyFormula(formula)}
                              >
                                Switch key to {parentTonicLabel} and apply
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="modes-formulas-empty">
                  <span className="empty-icon" aria-hidden="true">
                    🎼
                  </span>
                  <p>
                    Для этого лада нет предустановленных каденций. Вы можете составить свою
                    последовательность из аккордов слева.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer modes-footer">
          <label className="modes-switch-key-label">
            <input
              type="checkbox"
              checked={switchKeyOnApply}
              aria-label={`Switch project key to ${parentTonicLabel} when applying`}
              onChange={(e) => {
                setSwitchKeyOnApply(e.target.checked);
                setApplyError(undefined);
              }}
            />
            <span>Switch project key to {parentTonicLabel} when applying</span>
          </label>
          <div className="modes-footer-actions">
            {onApplyKeyToProject && (
              <button type="button" className="modes-apply-key-btn" onClick={handleApplyKey}>
                Set Project Key ({parentTonicLabel})
              </button>
            )}
            <button type="button" className="btn btn-primary modes-done-btn" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
