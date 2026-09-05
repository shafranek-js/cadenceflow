import type { FunctionalPreset } from "../../domain/progression/presets";
import { BUILT_IN_PRESETS } from "../../domain/progression/builtInPresets";
import type { Project } from "../../domain/project/project";
import { useModalFocus } from "../common/useModalFocus";
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
}

export function PresetsPanel({
  isOpen,
  isTopmost = true,
  project,
  onClose,
  onOpenApplyDialog,
  onOpenSaveDialog,
  onDeleteCustomPreset,
}: PresetsPanelProps) {
  const dialogRef = useModalFocus<HTMLElement>({
    isOpen,
    isTopmost,
    onClose,
  });

  if (!isOpen) return null;

  const contextLabel = formatContextLabel(project);
  const customPresets = project.customPresets;

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
            <h2 id="presets-panel-title">Presets</h2>
            <span className="presets-panel-subtitle">
              Reusable functional progressions ({contextLabel})
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
              ×
            </button>
          </div>
        </header>

        <div className="presets-panel-body">
          <p className="presets-info-text">
            Presets store harmonic functions and durations only. Performance settings are
            instantiated from your current Piano defaults when applied.
          </p>

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
                        <span className="preview-label">Context ({contextLabel}):</span>
                        <span className="preview-text">{realization.text}</span>
                      </div>
                    </div>

                    <div className="preset-card-actions">
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
                          <span className="preview-label">Context ({contextLabel}):</span>
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
