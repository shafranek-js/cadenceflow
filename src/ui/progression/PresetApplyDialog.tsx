import { useState, useEffect, type FormEvent } from "react";
import type { FunctionalPreset, PresetApplyMode } from "../../domain/progression/presets";
import type { Project } from "../../domain/project/project";
import { useModalFocus } from "../common/useModalFocus";
import { Icon } from "../common/Icon";
import {
  formatContextLabel,
  formatPresetStepDuration,
  getPresetRealizationSummary,
} from "./presetUtils";

export interface PresetApplyDialogProps {
  readonly isOpen: boolean;
  readonly preset: FunctionalPreset | null;
  readonly project: Project;
  readonly onClose: () => void;
  readonly onApply: (preset: FunctionalPreset, mode: PresetApplyMode) => void;
}

export function PresetApplyDialog({
  isOpen,
  preset,
  project,
  onClose,
  onApply,
}: PresetApplyDialogProps) {
  const [selectedMode, setSelectedMode] = useState<PresetApplyMode>("replace");

  const dialogRef = useModalFocus<HTMLElement>({
    isOpen: isOpen && Boolean(preset),
    isTopmost: true,
    onClose,
  });

  const isEmptyProgression = project.progression.steps.length === 0;
  const selectedStepId = project.progression.selectedStepId;
  const selectedStepIndex = project.progression.steps.findIndex((s) => s.id === selectedStepId);
  const selectedStep =
    selectedStepIndex !== -1 ? project.progression.steps[selectedStepIndex] : null;

  // Reset selected mode when dialog opens or selection changes
  useEffect(() => {
    if (!isOpen) return;
    if (isEmptyProgression) {
      setSelectedMode("replace");
    } else if (selectedStepId) {
      setSelectedMode("insert");
    } else {
      setSelectedMode("append");
    }
  }, [isOpen, isEmptyProgression, selectedStepId]);

  if (!isOpen || !preset) return null;

  const contextLabel = formatContextLabel(project);
  const realization = getPresetRealizationSummary(preset, project);
  const canConfirm =
    realization.kind === "success" &&
    (isEmptyProgression || selectedMode !== "insert" || Boolean(selectedStepId));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canConfirm) return;
    const modeToApply: PresetApplyMode = isEmptyProgression ? "replace" : selectedMode;
    onApply(preset, modeToApply);
  };

  const getConfirmButtonLabel = (): string => {
    if (isEmptyProgression) return "Use Preset";
    switch (selectedMode) {
      case "replace":
        return "Replace Progression";
      case "append":
        return "Append Preset";
      case "insert":
        return "Insert Preset";
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={dialogRef}
        className="preset-apply-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-apply-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog-header">
          <h2 id="preset-apply-title">Apply Preset: {preset.name}</h2>
          <button
            type="button"
            className="dialog-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="dialog-body">
            {/* Functional sequence display */}
            <div className="preset-summary-section">
              <div className="summary-row">
                <span className="summary-label">Functional Sequence:</span>
                <span className="summary-value functional-sequence">
                  {preset.steps.map((s) => s.harmonicFunction.functionId).join(" · ")}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Durations:</span>
                <span className="summary-value duration-sequence">
                  {preset.steps.map((s) => formatPresetStepDuration(s.duration)).join(" · ")}
                </span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Target Context:</span>
                <span className="summary-value context-badge">{contextLabel}</span>
              </div>
            </div>

            {/* Contextual realization preview or error states */}
            {realization.kind === "success" && (
              <div className="context-preview-box" data-testid="preset-contextual-preview">
                <strong>Current Context Realization ({contextLabel}):</strong>
                <div className="realized-chords">{realization.text}</div>
              </div>
            )}

            {realization.kind === "ambiguous" && (
              <div
                className="warning-box"
                role="alert"
                aria-live="polite"
                data-testid="preset-ambiguous-alert"
              >
                <strong>Ambiguous Harmonic Mapping</strong>
                <p>This preset has an ambiguous harmonic mapping in the current context.</p>
                {realization.ambiguousAlternatives && (
                  <p className="alternatives-note">
                    Candidate alternatives: {realization.ambiguousAlternatives.join(", ")}
                  </p>
                )}
                <p className="resolution-instruction">
                  Switch the module or select a compatible context before applying this preset.
                </p>
              </div>
            )}

            {realization.kind === "incompatible" && (
              <div
                className="error-box"
                role="alert"
                aria-live="assertive"
                data-testid="preset-incompatible-alert"
              >
                <strong>Incompatible Harmonic Context</strong>
                <p>This preset cannot be realized in the current harmony context.</p>
                {realization.unsupportedFunctionIds && (
                  <p className="unsupported-note">
                    Unsupported harmonic functions: {realization.unsupportedFunctionIds.join(", ")}
                  </p>
                )}
              </div>
            )}

            <p className="performance-hint">
              Performance uses your current Piano defaults when the preset is applied.
            </p>

            {/* Mode choices */}
            <div className="mode-selection-section">
              <h3>Insertion Mode</h3>
              {isEmptyProgression ? (
                <p className="empty-progression-note">
                  Progression is currently empty. Applying this preset will create the initial
                  progression.
                </p>
              ) : (
                <div className="mode-options" role="radiogroup" aria-label="Preset insertion mode">
                  {/* Replace */}
                  <label
                    className={`mode-option ${selectedMode === "replace" ? "is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="preset-apply-mode"
                      value="replace"
                      checked={selectedMode === "replace"}
                      onChange={() => setSelectedMode("replace")}
                    />
                    <div className="mode-details">
                      <strong>Replace Progression</strong>
                      <span>Replaces the entire progression and clears selection.</span>
                    </div>
                  </label>

                  {/* Append */}
                  <label
                    className={`mode-option ${selectedMode === "append" ? "is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="preset-apply-mode"
                      value="append"
                      checked={selectedMode === "append"}
                      onChange={() => setSelectedMode("append")}
                    />
                    <div className="mode-details">
                      <strong>Append to End</strong>
                      <span>Adds preset steps to the end of the progression.</span>
                    </div>
                  </label>

                  {/* Insert */}
                  <label
                    className={`mode-option ${selectedMode === "insert" ? "is-selected" : ""} ${
                      !selectedStepId ? "is-disabled" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="preset-apply-mode"
                      value="insert"
                      checked={selectedMode === "insert"}
                      disabled={!selectedStepId}
                      aria-describedby="insert-mode-description"
                      onChange={() => setSelectedMode("insert")}
                    />
                    <div className="mode-details">
                      <strong>
                        {selectedStepId
                          ? `Insert before Step ${selectedStepIndex + 1}: ${
                              selectedStep?.kind === "chord"
                                ? selectedStep.harmonicFunction.functionId
                                : "Rest"
                            }`
                          : "Insert at Selected Step (Unavailable)"}
                      </strong>
                      <span id="insert-mode-description">
                        {selectedStepId
                          ? "Inserts preset steps immediately before the selected step."
                          : "Select a progression step to insert before it."}
                      </span>
                    </div>
                  </label>
                </div>
              )}
            </div>
          </div>

          <footer className="dialog-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary-btn"
              disabled={!canConfirm}
              data-testid="preset-apply-confirm-btn"
            >
              {getConfirmButtonLabel()}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
