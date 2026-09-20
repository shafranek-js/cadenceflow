import { useState } from "react";
import type { FunctionalPreset } from "../../domain/progression/presets";
import { BUILT_IN_PRESETS } from "../../domain/progression/builtInPresets";
import { getFormulasForModule } from "../../domain/progression/cadenceFormulas";
import { GENRE_FOCUS_OPTIONS, type GenreFocusId } from "../../domain/harmony/functionSemantics";
import type { Project } from "../../domain/project/project";
import { useModalFocus } from "../common/useModalFocus";
import { Icon } from "../common/Icon";
import {
  formatContextLabel,
  formatPresetStepDuration,
  getPresetRealizationSummary,
} from "./presetUtils";

export interface PresetsPanelProps {
  readonly isOpen: boolean;
  readonly isTopmost?: boolean;
  readonly project: Project;
  readonly onClose: () => void;
  readonly onOpenApplyDialog: (preset: FunctionalPreset) => void;
  readonly onOpenSaveDialog: () => void;
  readonly onDeleteCustomPreset: (presetId: string) => void;
  readonly onAuditionPreset?: ((preset: FunctionalPreset) => void) | undefined;
  readonly onStopAudition?: (() => void) | undefined;
  readonly auditioningPresetId?: string | null | undefined;
}

export function PresetsPanel({
  isOpen,
  isTopmost = true,
  project,
  onClose,
  onOpenApplyDialog,
  onOpenSaveDialog,
  onDeleteCustomPreset,
  onAuditionPreset,
  onStopAudition,
  auditioningPresetId,
}: PresetsPanelProps) {
  const dialogRef = useModalFocus<HTMLElement>({
    isOpen,
    isTopmost,
    onClose,
  });

  const [formulaGenre, setFormulaGenre] = useState<GenreFocusId | "all">(
    () => project.presentation.genreFocus ?? "all",
  );

  if (!isOpen) return null;

  const contextLabel = formatContextLabel(project);
  const customPresets = project.customPresets;

  const moduleFormulas = getFormulasForModule(project.activeModule);
  const displayedFormulas =
    formulaGenre === "all"
      ? moduleFormulas
      : moduleFormulas.filter((f) => f.genre === formulaGenre || f.tags.includes(formulaGenre));

  const renderAuditionButton = (preset: FunctionalPreset) => {
    if (!onAuditionPreset) return null;
    const isPlaying = auditioningPresetId === preset.id;
    return (
      <button
        type="button"
        className={`secondary-btn preset-audition-btn ${isPlaying ? "is-auditioning" : ""}`}
        onClick={() => {
          if (isPlaying) {
            onStopAudition?.();
          } else {
            onAuditionPreset(preset);
          }
        }}
        aria-label={isPlaying ? `Stop auditioning ${preset.name}` : `Audition ${preset.name}`}
        data-testid={`audition-preset-${preset.id}`}
        title={isPlaying ? "Stop audio preview" : "Hear progression in current key"}
      >
        <Icon name={isPlaying ? "stop" : "play"} />
        <span>{isPlaying ? "Stop" : "Audition"}</span>
      </button>
    );
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={isTopmost ? onClose : undefined}>
      <section
        ref={dialogRef}
        className={`presets-panel ${!isTopmost ? "is-inert" : ""}`}
        role="dialog"
        aria-modal={isTopmost ? "true" : undefined}
        aria-hidden={!isTopmost ? true : undefined}
        inert={!isTopmost ? true : undefined}
        aria-labelledby="presets-panel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="presets-panel-header">
          <div>
            <h2 id="presets-panel-title">Presets &amp; Cadence Formulas</h2>
            <span className="presets-panel-subtitle">
              Reusable functional progressions &amp; canonical patterns ({contextLabel})
            </span>
          </div>
          <div className="presets-panel-header-actions">
            <button
              type="button"
              className="save-as-preset-btn"
              onClick={onOpenSaveDialog}
              aria-label="Save current progression as preset"
              data-testid="panel-save-preset-btn"
            >
              + Save as Preset
            </button>
            <button
              type="button"
              className="dialog-close-btn"
              onClick={onClose}
              aria-label="Close presets panel"
            >
              <Icon name="close" />
            </button>
          </div>
        </header>

        <div className="presets-panel-body">
          <p className="presets-info-text">
            Presets store harmonic functions and durations only. Performance settings are
            instantiated from your current Piano defaults when applied. Click{" "}
            <strong>Audition</strong> to preview any progression in the current key.
          </p>

          {/* Cadence Formulas & Quick Starters Section */}
          <section
            className="presets-section cadence-formulas-section"
            aria-labelledby="cadence-formulas-heading"
            data-testid="cadence-formulas-section"
          >
            <div className="section-header formulas-section-header">
              <div className="section-title-wrap">
                <h3 id="cadence-formulas-heading">⚡ Cadence Formulas &amp; Quick Starters</h3>
                <span className="section-badge formula-badge">Canonical Cadence Patterns</span>
              </div>
              <div
                className="formula-genre-pills"
                role="tablist"
                aria-label="Filter formulas by genre"
              >
                {GENRE_FOCUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="tab"
                    aria-selected={formulaGenre === opt.id}
                    className={`formula-genre-pill ${formulaGenre === opt.id ? "is-active" : ""}`}
                    onClick={() => setFormulaGenre(opt.id)}
                    data-testid={`formula-filter-${opt.id}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {displayedFormulas.length === 0 ? (
              <div className="formulas-empty-hint" data-testid="formulas-empty-hint">
                <p>No formulas for &quot;{formulaGenre}&quot; in the current harmonic mode.</p>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setFormulaGenre("all")}
                >
                  Show all formulas
                </button>
              </div>
            ) : (
              <div className="preset-card-grid" data-testid="cadence-formulas-grid">
                {displayedFormulas.map((formula) => {
                  const realization = getPresetRealizationSummary(formula, project);
                  const isPlaying = auditioningPresetId === formula.id;
                  return (
                    <article
                      key={formula.id}
                      className={`preset-card formula-card ${isPlaying ? "is-auditioning" : ""}`}
                      data-testid={`preset-card-${formula.id}`}
                    >
                      <div className="preset-card-main">
                        <div className="preset-card-header">
                          <h4 className="preset-name">{formula.name}</h4>
                          <div className="formula-tags-wrap">
                            <span className="source-tag formula-genre-tag">{formula.genre}</span>
                            <span className="source-tag formula-cat-tag">{formula.category}</span>
                          </div>
                        </div>

                        {formula.description && (
                          <p className="preset-description">{formula.description}</p>
                        )}

                        <div className="formula-rationale-box">
                          <span className="rationale-heading">Theory Rationale:</span>
                          <p className="rationale-text">{formula.theoreticalRationale}</p>
                        </div>

                        <div className="preset-functions-row">
                          <span className="functions-label">Functions:</span>
                          <span className="functional-sequence">
                            {formula.steps.map((s) => s.harmonicFunction.functionId).join(" · ")}
                          </span>
                        </div>

                        <div className="preset-durations-row">
                          <span className="durations-label">Durations:</span>
                          <span className="duration-sequence">
                            {formula.steps
                              .map((s) => formatPresetStepDuration(s.duration))
                              .join(" · ")}
                          </span>
                        </div>

                        <div
                          className={`preset-preview-row ${
                            realization.kind === "success"
                              ? "preview-success"
                              : realization.kind === "ambiguous"
                                ? "preview-ambiguous"
                                : "preview-incompatible"
                          }`}
                        >
                          <span className="preview-label">Context ({contextLabel}): </span>
                          <span className="preview-text">{realization.text}</span>
                        </div>
                      </div>

                      <div className="preset-card-actions">
                        {renderAuditionButton(formula)}
                        <button
                          type="button"
                          className="primary-btn apply-preset-btn"
                          onClick={() => onOpenApplyDialog(formula)}
                          data-testid={`apply-preset-${formula.id}`}
                        >
                          Apply
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Built-in Presets Section */}
          <section className="presets-section" aria-labelledby="builtin-presets-heading">
            <div className="section-header">
              <h3 id="builtin-presets-heading">Built-in Presets</h3>
              <span className="section-badge">Curated functional catalog</span>
            </div>

            <div className="preset-card-grid" data-testid="builtin-preset-grid">
              {BUILT_IN_PRESETS.map((preset) => {
                const realization = getPresetRealizationSummary(preset, project);
                return (
                  <article
                    key={preset.id}
                    className="preset-card builtin-card"
                    data-testid={`preset-card-${preset.id}`}
                  >
                    <div className="preset-card-main">
                      <div className="preset-card-header">
                        <h4 className="preset-name">{preset.name}</h4>
                        <span className="source-tag builtin-tag">Built-in</span>
                      </div>

                      {preset.description && (
                        <p className="preset-description">{preset.description}</p>
                      )}

                      <div className="preset-functions-row">
                        <span className="functions-label">Functions:</span>
                        <span className="functional-sequence">
                          {preset.steps.map((s) => s.harmonicFunction.functionId).join(" · ")}
                        </span>
                      </div>

                      <div className="preset-durations-row">
                        <span className="durations-label">Durations:</span>
                        <span className="duration-sequence">
                          {preset.steps
                            .map((s) => formatPresetStepDuration(s.duration))
                            .join(" · ")}
                        </span>
                      </div>

                      <div
                        className={`preset-preview-row ${
                          realization.kind === "success"
                            ? "preview-success"
                            : realization.kind === "ambiguous"
                              ? "preview-ambiguous"
                              : "preview-incompatible"
                        }`}
                      >
                        <span className="preview-label">Context ({contextLabel}): </span>
                        <span className="preview-text">{realization.text}</span>
                      </div>
                    </div>

                    <div className="preset-card-actions">
                      {renderAuditionButton(preset)}
                      <button
                        type="button"
                        className="primary-btn apply-preset-btn"
                        onClick={() => onOpenApplyDialog(preset)}
                        data-testid={`apply-preset-${preset.id}`}
                      >
                        Apply
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* Custom Presets Section */}
          <section className="presets-section" aria-labelledby="custom-presets-heading">
            <div className="section-header">
              <h3 id="custom-presets-heading">Custom Presets</h3>
              <span className="section-badge">Project-owned</span>
            </div>

            {customPresets.length === 0 ? (
              <div className="custom-presets-empty" data-testid="custom-presets-empty">
                <p>No custom presets saved yet.</p>
                <p className="hint">
                  Build a chord progression in My Progression, then click{" "}
                  <strong>Save as Preset</strong> above to store it.
                </p>
              </div>
            ) : (
              <div className="preset-card-grid" data-testid="custom-preset-grid">
                {customPresets.map((preset) => {
                  const realization = getPresetRealizationSummary(preset, project);
                  return (
                    <article
                      key={preset.id}
                      className="preset-card custom-card"
                      data-testid={`preset-card-${preset.id}`}
                    >
                      <div className="preset-card-main">
                        <div className="preset-card-header">
                          <h4 className="preset-name">{preset.name}</h4>
                          <span className="source-tag custom-tag">Custom</span>
                        </div>

                        {preset.description && (
                          <p className="preset-description">{preset.description}</p>
                        )}

                        <div className="preset-functions-row">
                          <span className="functions-label">Functions:</span>
                          <span className="functional-sequence">
                            {preset.steps.map((s) => s.harmonicFunction.functionId).join(" · ")}
                          </span>
                        </div>

                        <div className="preset-durations-row">
                          <span className="durations-label">Durations:</span>
                          <span className="duration-sequence">
                            {preset.steps
                              .map((s) => formatPresetStepDuration(s.duration))
                              .join(" · ")}
                          </span>
                        </div>

                        <div
                          className={`preset-preview-row ${
                            realization.kind === "success"
                              ? "preview-success"
                              : realization.kind === "ambiguous"
                                ? "preview-ambiguous"
                                : "preview-incompatible"
                          }`}
                        >
                          <span className="preview-label">Context ({contextLabel}): </span>
                          <span className="preview-text">{realization.text}</span>
                        </div>
                      </div>

                      <div className="preset-card-actions">
                        <button
                          type="button"
                          className="secondary-btn delete-preset-btn"
                          onClick={() => onDeleteCustomPreset(preset.id)}
                          aria-label={`Delete custom preset ${preset.name}`}
                          data-testid={`delete-preset-${preset.id}`}
                        >
                          Delete
                        </button>
                        {renderAuditionButton(preset)}
                        <button
                          type="button"
                          className="primary-btn apply-preset-btn"
                          onClick={() => onOpenApplyDialog(preset)}
                          data-testid={`apply-preset-${preset.id}`}
                        >
                          Apply
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
