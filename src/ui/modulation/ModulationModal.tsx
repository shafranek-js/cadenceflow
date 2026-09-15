import { useMemo, useState, type RefObject } from "react";
import type { HarmonicModuleId } from "../../domain/harmony/functions";
import {
  formatKeyName,
  getAvailableModulations,
  getKeyRelationship,
  getModulationCategoryBadge,
  type ModulationPath,
  type ModulationStyle,
} from "../../domain/harmony/modulation";
import type { PitchClassIdentity } from "../../domain/harmony/pitch";
import type { Project } from "../../domain/project/project";
import { defaultTonicSpelling, formatPitchSpelling } from "../../domain/harmony/spelling";
import { useModalFocus } from "../common/useModalFocus";
import { Icon } from "../common/Icon";

const CHROMATIC_PITCHES: readonly { readonly pc: PitchClassIdentity; readonly label: string }[] =
  Object.freeze([
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

export interface ModulationModalProps {
  readonly isOpen: boolean;
  readonly project: Project;
  readonly restoreFocusRef?: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onAuditionPath: (path: ModulationPath) => void;
  readonly onStopAudition: () => void;
  readonly auditioningPathId?: string | null;
  readonly onApplyBridge: (
    path: ModulationPath,
    insertMode: "append" | "insert",
    switchKey: boolean,
  ) => void;
  readonly selectedStepId?: string | undefined;
}

export function ModulationModal({
  isOpen,
  project,
  restoreFocusRef,
  onClose,
  onAuditionPath,
  onStopAudition,
  auditioningPathId = null,
  onApplyBridge,
  selectedStepId,
}: ModulationModalProps) {
  const dialogRef = useModalFocus<HTMLDivElement>({
    isOpen,
    isTopmost: true,
    onClose,
    ...(restoreFocusRef ? { restoreFocusRef } : {}),
  });

  // Default target: Dominant (fifth) above source, or relative minor
  const defaultTargetTonic: PitchClassIdentity = useMemo(() => {
    return ((project.tonic + 7) % 12) as PitchClassIdentity;
  }, [project.tonic]);

  const [targetTonic, setTargetTonic] = useState<PitchClassIdentity>(defaultTargetTonic);
  const [targetModule, setTargetModule] = useState<HarmonicModuleId>(project.activeModule);
  const [activeCategory, setActiveCategory] = useState<ModulationStyle | "all">("all");
  const [insertMode, setInsertMode] = useState<"append" | "insert">("append");
  const [switchKey, setSwitchKey] = useState<boolean>(false);

  const sourceKeyName = formatKeyName(project.tonic, project.activeModule);
  const targetKeyName = formatKeyName(targetTonic, targetModule);

  const relationship = useMemo(() => {
    return getKeyRelationship(project.tonic, project.activeModule, targetTonic, targetModule);
  }, [project.tonic, project.activeModule, targetTonic, targetModule]);

  const allPaths = useMemo(() => {
    return getAvailableModulations(project.tonic, project.activeModule, targetTonic, targetModule);
  }, [project.tonic, project.activeModule, targetTonic, targetModule]);

  const filteredPaths = useMemo(() => {
    if (activeCategory === "all") return allPaths;
    return allPaths.filter((path) => path.category === activeCategory);
  }, [activeCategory, allPaths]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop modulation-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="modal-card modulation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modulation-modal-title"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="modal-header modulation-header">
          <div className="modulation-title-group">
            <h2 id="modulation-modal-title" className="modulation-title">
              <span className="modulation-title-icon" aria-hidden="true">🧭</span>
              Modulation Master & Key Transitions
            </h2>
            <div className="modulation-current-key-badge">
              <span className="badge-label">Current Key:</span>
              <strong className="badge-key">{sourceKeyName}</strong>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-button"
            aria-label="Close Modulation Master"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Target Key & Mode Selector */}
        <section className="modulation-target-section" aria-label="Target Key Selection">
          <div className="target-selection-row">
            <div className="target-key-picker">
              <span className="target-picker-label">Target Key:</span>
              <div className="key-pills-strip" role="radiogroup" aria-label="Target Key Tonic">
                {CHROMATIC_PITCHES.map(({ pc, label }) => {
                  const isSelected = targetTonic === pc;
                  return (
                    <button
                      key={pc}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={`key-pill ${isSelected ? "is-selected" : ""}`}
                      onClick={() => setTargetTonic(pc)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="target-mode-picker">
              <span className="target-picker-label">Mode:</span>
              <div className="mode-toggle-group" role="radiogroup" aria-label="Target Key Mode">
                <button
                  type="button"
                  role="radio"
                  aria-checked={targetModule === "progressions"}
                  className={`mode-toggle-btn ${targetModule === "progressions" ? "is-active" : ""}`}
                  onClick={() => setTargetModule("progressions")}
                >
                  Major
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={targetModule === "dark-harmony"}
                  className={`mode-toggle-btn ${targetModule === "dark-harmony" ? "is-active" : ""}`}
                  onClick={() => setTargetModule("dark-harmony")}
                >
                  Minor
                </button>
              </div>
            </div>
          </div>

          {/* Key Relationship Banner */}
          <div className="key-relationship-banner">
            <div className="relationship-header">
              <span className="relationship-tag">{relationship.relationName}</span>
              <span className="circle-distance-tag">
                {relationship.circleOfFifthsDistance === 0
                  ? "0 circle distance"
                  : `${relationship.circleOfFifthsDistance} step${relationship.circleOfFifthsDistance > 1 ? "s" : ""} on circle of fifths`}
              </span>
            </div>
            <p className="relationship-desc">{relationship.description}</p>
          </div>
        </section>

        {/* Filter Category Tabs */}
        <nav className="modulation-category-tabs" aria-label="Modulation Categories">
          <button
            type="button"
            className={`mod-tab-btn ${activeCategory === "all" ? "is-active" : ""}`}
            onClick={() => setActiveCategory("all")}
          >
            All Paths ({allPaths.length})
          </button>
          <button
            type="button"
            className={`mod-tab-btn ${activeCategory === "pivot" ? "is-active" : ""}`}
            onClick={() => setActiveCategory("pivot")}
          >
            Common Chord ({allPaths.filter((p) => p.category === "pivot").length})
          </button>
          <button
            type="button"
            className={`mod-tab-btn ${activeCategory === "jazz-turnaround" ? "is-active" : ""}`}
            onClick={() => setActiveCategory("jazz-turnaround")}
          >
            Jazz Turnaround ({allPaths.filter((p) => p.category === "jazz-turnaround").length})
          </button>
          <button
            type="button"
            className={`mod-tab-btn ${activeCategory === "tritone-sub" ? "is-active" : ""}`}
            onClick={() => setActiveCategory("tritone-sub")}
          >
            Tritone Bridge ({allPaths.filter((p) => p.category === "tritone-sub").length})
          </button>
          {(allPaths.some((p) => p.category === "chromatic-mediant") ||
            allPaths.some((p) => p.category === "direct-lift")) && (
            <button
              type="button"
              className={`mod-tab-btn ${
                activeCategory === "chromatic-mediant" || activeCategory === "direct-lift"
                  ? "is-active"
                  : ""
              }`}
              onClick={() => {
                const mediantExists = allPaths.some((p) => p.category === "chromatic-mediant");
                setActiveCategory(mediantExists ? "chromatic-mediant" : "direct-lift");
              }}
            >
              Chromatic & Lift
            </button>
          )}
        </nav>

        {/* Application Options Toolbar */}
        <div className="modulation-options-bar">
          <div className="insert-mode-options">
            <span className="options-label">Insertion Target:</span>
            <label className="radio-option-label">
              <input
                type="radio"
                name="insert-mode"
                value="append"
                checked={insertMode === "append"}
                onChange={() => setInsertMode("append")}
              />
              Append to end
            </label>
            {selectedStepId && (
              <label className="radio-option-label">
                <input
                  type="radio"
                  name="insert-mode"
                  value="insert"
                  checked={insertMode === "insert"}
                  onChange={() => setInsertMode("insert")}
                />
                Insert at selection
              </label>
            )}
          </div>

          <label className="switch-key-checkbox-label" title="Sets project active key and mode to target upon inserting the bridge">
            <input
              type="checkbox"
              checked={switchKey}
              onChange={(e) => setSwitchKey(e.target.checked)}
            />
            <span>Update project key to <strong>{targetKeyName}</strong></span>
          </label>
        </div>

        {/* Pathways List */}
        <div className="modulation-paths-container" tabIndex={0} aria-label="Available Modulation Pathways">
          {filteredPaths.length === 0 ? (
            <div className="modulation-empty-state">
              <p>
                {project.tonic === targetTonic && project.activeModule === targetModule
                  ? "Source and target key are identical. Select a different target key or mode to explore modulation paths."
                  : "No specific modulation pathways found for the selected category."}
              </p>
            </div>
          ) : (
            filteredPaths.map((path) => {
              const badge = getModulationCategoryBadge(path.category);
              const isAuditioning = auditioningPathId === path.id;

              return (
                <article
                  key={path.id}
                  className={`modulation-path-card ${isAuditioning ? "is-auditioning" : ""}`}
                  data-testid={`modulation-path-${path.id}`}
                >
                  <div className="mod-card-header">
                    <div className="mod-card-title-row">
                      <span className={`mod-badge ${badge.className}`}>{badge.label}</span>
                      <h3 className="mod-path-name">{path.name}</h3>
                    </div>
                    <div className="mod-score-pill" title="Harmonic smoothness rating">
                      <span className="score-num">{path.smoothnessScore}%</span>
                      <span className="score-label">Smooth</span>
                    </div>
                  </div>

                  {/* Bridge Steps Visualizer */}
                  <div className="mod-steps-strip" aria-label="Bridge Steps Sequence">
                    {path.bridgeSteps.map((step, idx) => (
                      <div key={step.id} className="mod-step-wrapper">
                        <div className={`mod-step-chip role-${step.role}`}>
                          <div className="step-chord-symbol">{step.chordSymbol}</div>
                          <div className="step-role-tag">{step.role}</div>
                          <div className="step-roman-analysis">
                            <span className="roman-src" title={`In source key (${sourceKeyName})`}>
                              {step.sourceFunction.roman}
                            </span>
                            <span className="roman-divider">/</span>
                            <span className="roman-tgt" title={`In target key (${targetKeyName})`}>
                              {step.targetFunction.roman}
                            </span>
                          </div>
                        </div>
                        {idx < path.bridgeSteps.length - 1 && (
                          <span className="mod-step-arrow" aria-hidden="true">
                            →
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Why it works rationale */}
                  <div className="mod-rationale-box">
                    <span className="rationale-icon" aria-hidden="true">💡</span>
                    <p className="rationale-text">{path.description}</p>
                  </div>

                  {/* Actions */}
                  <div className="mod-card-actions">
                    <button
                      type="button"
                      className={`mod-audition-btn ${isAuditioning ? "is-playing" : ""}`}
                      aria-label={isAuditioning ? `Stop auditioning ${path.name}` : `Audition ${path.name}`}
                      onClick={() => {
                        if (isAuditioning) {
                          onStopAudition();
                        } else {
                          onAuditionPath(path);
                        }
                      }}
                    >
                      <span className="btn-icon" aria-hidden="true">
                        {isAuditioning ? "■" : "▶"}
                      </span>
                      <span>{isAuditioning ? "Stop" : "Audition"}</span>
                    </button>

                    <button
                      type="button"
                      className="mod-apply-btn"
                      onClick={() => {
                        onApplyBridge(path, insertMode, switchKey);
                        onClose();
                      }}
                    >
                      <span>Insert Bridge</span>
                      <span className="btn-arrow" aria-hidden="true">→</span>
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
