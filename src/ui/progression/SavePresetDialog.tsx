import { useState, useEffect, useRef, type FormEvent } from "react";
import type { Project } from "../../domain/project/project";
import { useModalFocus } from "../common/useModalFocus";
import { Icon } from "../common/Icon";

export interface SavePresetDialogProps {
  readonly isOpen: boolean;
  readonly project: Project;
  readonly onClose: () => void;
  readonly onSave: (name: string) => void;
}

export function SavePresetDialog({ isOpen, project, onClose, onSave }: SavePresetDialogProps) {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const dialogRef = useModalFocus<HTMLElement>({
    isOpen,
    isTopmost: true,
    onClose,
    initialFocusRef: inputRef,
  });

  useEffect(() => {
    if (isOpen) {
      setName("");
      setTouched(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const hasRest = project.progression.steps.some((step) => step.kind === "rest");
  const isEmpty = project.progression.steps.length === 0;
  const isNameEmpty = !name.trim();

  let validationError: string | null = null;
  if (hasRest) {
    validationError =
      "Custom Presets currently support chord steps only. Remove Rest steps before saving this progression as a preset.";
  } else if (isEmpty) {
    validationError =
      "Cannot save an empty progression as a preset. Add chord steps to your progression first.";
  } else if (touched && isNameEmpty) {
    validationError = "Preset name cannot be empty.";
  }

  const canSave = !hasRest && !isEmpty && !isNameEmpty;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSave) return;
    onSave(name.trim());
    onClose();
  };

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={dialogRef}
        className="save-preset-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-preset-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialog-header">
          <h2 id="save-preset-title">Save as Custom Preset</h2>
          <button
            type="button"
            className="dialog-close-btn"
            onClick={onClose}
            aria-label="Close save preset dialog"
          >
            <Icon name="close" />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="dialog-body">
            <p className="save-preset-intro">
              Saves the current progression's harmonic functions and per-step durations as a
              reusable functional preset. Performance settings will be stripped and instantiated
              from piano defaults on application.
            </p>

            {hasRest && (
              <div className="warning-box" role="alert" data-testid="save-preset-rest-warning">
                <strong>Unsupported Progression</strong>
                <p>
                  Custom Presets currently support chord steps only. Remove Rest steps before saving
                  this progression as a preset.
                </p>
              </div>
            )}

            {isEmpty && (
              <div className="warning-box" role="alert" data-testid="save-preset-empty-warning">
                <strong>Empty Progression</strong>
                <p>Cannot save an empty progression as a preset. Add chord steps first.</p>
              </div>
            )}

            {!hasRest && !isEmpty && (
              <div className="form-group">
                <label htmlFor="preset-name-input">
                  Preset Name <span className="required-marker">*</span>
                </label>
                <input
                  ref={inputRef}
                  id="preset-name-input"
                  type="text"
                  className={`text-input ${touched && isNameEmpty ? "input-error" : ""}`}
                  placeholder="e.g. Turnaround in Four"
                  value={name}
                  autoFocus
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!touched) setTouched(true);
                  }}
                  onBlur={() => setTouched(true)}
                  aria-invalid={touched && isNameEmpty}
                  aria-describedby={validationError ? "preset-name-validation" : undefined}
                />
                {touched && isNameEmpty && (
                  <p
                    id="preset-name-validation"
                    className="error-text"
                    role="alert"
                    data-testid="preset-name-error"
                  >
                    Preset name cannot be empty.
                  </p>
                )}
              </div>
            )}
          </div>

          <footer className="dialog-actions">
            <button
              type="button"
              className="secondary-btn"
              onClick={onClose}
              data-testid="save-preset-cancel-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-btn"
              disabled={!canSave}
              data-testid="save-preset-confirm-btn"
            >
              Save Preset
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
