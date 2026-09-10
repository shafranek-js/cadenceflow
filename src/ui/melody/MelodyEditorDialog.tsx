import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import type {
  ChordMelodyRecipe,
  MelodyGrid,
  MelodyInstrument,
  MelodyOctaveOffset,
  MelodyPattern,
} from "../../domain/melody/types";
import type { ChordStep } from "../../domain/progression/step";
import type { Project } from "../../domain/project/project";
import { createMelodyTimeline } from "../../notation/melodyStaffProjection";
import { useModalFocus } from "../common/useModalFocus";
import { MelodyStaffView } from "./MelodyStaffView";
import { MELODY_GRID_LABELS, MELODY_INSTRUMENT_LABELS, MELODY_PATTERN_LABELS } from "./labels";

export const DEFAULT_MELODY_RECIPE: ChordMelodyRecipe = Object.freeze({
  pattern: "up",
  grid: "eighth",
  octaveOffset: 0,
});

const PATTERNS: readonly MelodyPattern[] = Object.freeze([
  "up",
  "down",
  "up-down",
  "down-up",
  "outside-in",
  "inside-out",
]);
const GRIDS: readonly MelodyGrid[] = Object.freeze([
  "quarter",
  "eighth",
  "sixteenth",
  "eighth-triplet",
  "sixteenth-triplet",
]);
const OCTAVE_OFFSETS: readonly MelodyOctaveOffset[] = Object.freeze([-2, -1, 0, 1, 2]);

function previewProject(
  project: Project,
  step: ChordStep,
  recipe: ChordMelodyRecipe,
  instrument: MelodyInstrument,
): Project {
  const previewStep: ChordStep = Object.freeze({ ...step, melody: Object.freeze({ ...recipe }) });
  return Object.freeze({
    ...project,
    melodyTrack: Object.freeze({ ...project.melodyTrack, instrument }),
    progression: Object.freeze({
      ...project.progression,
      // The dialog previews the edited phrase, not the complete composition.
      // The canonical realization is Step-local; keeping only this Step avoids
      // unrelated recipes and empty measures turning a compact preview into a
      // second full score.
      steps: Object.freeze([previewStep]),
      selectedStepId: step.id,
    }),
  });
}

export interface MelodyEditorDialogProps {
  readonly isOpen: boolean;
  readonly mode: "create" | "edit";
  readonly step: ChordStep;
  readonly project: Project;
  readonly restoreFocusRef?: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onApply: (recipe: ChordMelodyRecipe, instrument: MelodyInstrument) => void;
}

export function MelodyEditorDialog({
  isOpen,
  mode,
  step,
  project,
  restoreFocusRef,
  onClose,
  onApply,
}: MelodyEditorDialogProps) {
  const patternRef = useRef<HTMLSelectElement | null>(null);
  const [recipe, setRecipe] = useState<ChordMelodyRecipe>(DEFAULT_MELODY_RECIPE);
  const [instrument, setInstrument] = useState<MelodyInstrument>(project.melodyTrack.instrument);

  const dialogRef = useModalFocus<HTMLElement>({
    isOpen,
    isTopmost: true,
    onClose,
    initialFocusRef: patternRef,
    ...(restoreFocusRef ? { restoreFocusRef } : {}),
  });

  useEffect(() => {
    if (!isOpen) return;
    setRecipe(step.melody ? { ...step.melody } : { ...DEFAULT_MELODY_RECIPE });
    setInstrument(project.melodyTrack.instrument);
  }, [isOpen, project.melodyTrack.instrument, step]);

  const preview = useMemo(() => {
    if (!isOpen) return { kind: "closed" as const };
    try {
      const projectWithDraft = previewProject(project, step, recipe, instrument);
      const timeline = createMelodyTimeline(projectWithDraft);
      return {
        kind: "ready" as const,
        project: projectWithDraft,
        timeline,
        measures: timeline.measures.filter((measure) =>
          measure.entries.some((entry) => entry.kind === "note" && entry.sourceStepId === step.id),
        ),
      };
    } catch (error) {
      return {
        kind: "error" as const,
        message: error instanceof Error ? error.message : "Melody preview could not be realized",
      };
    }
  }, [instrument, isOpen, project, recipe, step]);

  if (!isOpen) return null;

  const title = mode === "create" ? "Create Melody" : "Edit Melody";
  const applyDisabled = preview.kind !== "ready";
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (applyDisabled) return;
    onApply(recipe, instrument);
  };

  return (
    <div
      className="dialog-backdrop melody-editor-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="melody-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="melody-editor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div>
            <h2 id="melody-editor-title">{title}</h2>
            <p>Derived from the contextual upper voicing of this Chord Step.</p>
          </div>
          <button
            type="button"
            className="dialog-close-btn"
            onClick={onClose}
            aria-label="Close melody dialog"
          >
            ×
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="dialog-body melody-editor-body">
            <div className="melody-editor-fields">
              <label>
                <span>Pattern</span>
                <select
                  ref={patternRef}
                  aria-label="Melody Pattern"
                  value={recipe.pattern}
                  onChange={(event) =>
                    setRecipe((current) => ({
                      ...current,
                      pattern: event.target.value as MelodyPattern,
                    }))
                  }
                >
                  {PATTERNS.map((pattern) => (
                    <option key={pattern} value={pattern}>
                      {MELODY_PATTERN_LABELS[pattern]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Grid</span>
                <select
                  aria-label="Melody Grid"
                  value={recipe.grid}
                  onChange={(event) =>
                    setRecipe((current) => ({
                      ...current,
                      grid: event.target.value as MelodyGrid,
                    }))
                  }
                >
                  {GRIDS.map((grid) => (
                    <option key={grid} value={grid}>
                      {MELODY_GRID_LABELS[grid]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Octave offset</span>
                <select
                  aria-label="Melody Octave Offset"
                  value={recipe.octaveOffset}
                  onChange={(event) =>
                    setRecipe((current) => ({
                      ...current,
                      octaveOffset: Number(event.target.value) as MelodyOctaveOffset,
                    }))
                  }
                >
                  {OCTAVE_OFFSETS.map((offset) => (
                    <option key={offset} value={offset}>
                      {offset > 0 ? `+${offset}` : offset} octave$
                      {Math.abs(offset) === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Instrument</span>
                <select
                  aria-label="Melody Instrument"
                  value={instrument}
                  onChange={(event) => setInstrument(event.target.value as MelodyInstrument)}
                >
                  {Object.entries(MELODY_INSTRUMENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="melody-editor-preview" data-testid="melody-editor-preview">
              <div className="melody-editor-preview-heading">
                <strong>Notation preview</strong>
                <span>Concert pitch · Piano bass excluded</span>
              </div>
              {preview.kind === "error" ? (
                <p className="melody-editor-error" role="alert" data-testid="melody-editor-error">
                  {preview.message}
                </p>
              ) : preview.kind === "ready" && preview.measures.length > 0 ? (
                <div className="melody-editor-preview-measures">
                  {preview.measures.map((measure) => (
                    <MelodyStaffView
                      key={measure.measureIndex}
                      project={preview.project}
                      timeline={preview.timeline}
                      measure={measure}
                      onSelectStep={() => undefined}
                    />
                  ))}
                </div>
              ) : (
                <p>No notation preview is available.</p>
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
              data-testid="melody-editor-apply"
              disabled={applyDisabled}
            >
              Apply Melody
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
