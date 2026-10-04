import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import {
  MELODY_CONNECTIONS,
  MELODY_GRIDS,
  MELODY_PITCH_MOTIONS,
  MELODY_RHYTHMS,
  validateChordMelodyRecipe,
} from "../../domain/melody/types";
import type {
  ChordMelodyRecipe,
  MelodyGrid,
  MelodyInstrument,
  MelodyOctaveOffset,
  MelodyPitchMotion,
} from "../../domain/melody/types";
import type { AudioProviderState } from "../../audio/contracts";
import type { ChordStep } from "../../domain/progression/step";
import type { Project } from "../../domain/project/project";
import type { ExactPitch } from "../../domain/harmony/pitch";
import { exactPitch } from "../../domain/harmony/pitch";
import { compareRational, rational } from "../../domain/timing/rational";
import type { AuthoredMelodyNote, AuthoredMelodyPhrase } from "../../domain/melody/types";
import { formatPitchSpelling } from "../../domain/harmony/spelling";
import { computeScalePitches } from "../../domain/harmony/modes";
import {
  movePitchBySemitone,
  movePitchDiatonically,
  pitchForScaleDegree,
} from "./keyboardComposition";
import { realizeProgressionStepRealization } from "../../instruments/piano/profile";
import { pitchToConcertFrame } from "../../domain/progression/transposition";
import { createMelodyTimeline } from "../../notation/melodyStaffProjection";
import { useModalFocus } from "../common/useModalFocus";
import { Icon } from "../common/Icon";
import { MelodyStaffView } from "./MelodyStaffView";
import { MelodyPitchMotionGallery } from "./MelodyPitchMotionGallery";
import { MelodyInstrumentPicker } from "./MelodyInstrumentPicker";
import {
  MELODY_CONNECTION_LABELS,
  MELODY_GRID_LABELS,
  MELODY_PITCH_MOTION_LABELS,
  MELODY_RHYTHM_LABELS,
} from "./labels";

export const DEFAULT_MELODY_RECIPE: ChordMelodyRecipe = Object.freeze({
  pitchMotion: "up",
  rhythm: "even",
  connection: "retrigger",
  grid: "eighth",
  octaveOffset: 0,
});

const OCTAVE_OFFSETS: readonly MelodyOctaveOffset[] = Object.freeze([-2, -1, 0, 1, 2]);

function targetPitchLabel(pitch: ExactPitch): string {
  return `${formatPitchSpelling(pitch.spelling)}${pitch.octave}`;
}

function targetPitchClass(pitch: ExactPitch): number {
  return ((pitch.midiNumber % 12) + 12) % 12;
}

function previewProject(
  project: Project,
  step: ChordStep,
  recipe: ChordMelodyRecipe,
  instrumentOverride: MelodyInstrument | undefined,
): Project {
  const { melodyInstrumentOverride: _discardOverride, ...stepWithoutOverride } = step;
  const previewStep: ChordStep = Object.freeze({
    ...stepWithoutOverride,
    melody: Object.freeze({ mode: "generated", recipe: Object.freeze({ ...recipe }) }),
    ...(instrumentOverride !== undefined ? { melodyInstrumentOverride: instrumentOverride } : {}),
  });
  return Object.freeze({
    ...project,
    progression: Object.freeze({
      ...project.progression,
      // Preserve the complete progression so automatic voicing receives the
      // same preceding harmonic context as live playback. Remove recipes from
      // every other Step so the audition contains only this draft phrase.
      steps: Object.freeze(
        project.progression.steps.map((current) => {
          if (current.kind !== "chord") return current;
          if (current.id === step.id) return previewStep;
          if (!current.melody) return current;
          const { melody: _melody, ...withoutMelody } = current;
          return Object.freeze(withoutMelody);
        }),
      ),
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
  readonly onApply: (recipe: ChordMelodyRecipe, instrumentOverride?: MelodyInstrument) => void;
  readonly onApplyAuthored?: (phrase: AuthoredMelodyPhrase) => void;
  readonly authoredOnly?: boolean;
  readonly authoredTargetLabel?: string;
  readonly providerState?: AudioProviderState;
  readonly providerError?: string | null;
  readonly onRetryAudio?: () => void;
  readonly isPreviewPlaying?: boolean;
  readonly onPlayPreview?: (project: Project) => void;
  readonly onStopPreview?: () => void;
}

export function MelodyEditorDialog({
  isOpen,
  mode,
  step,
  project,
  restoreFocusRef,
  onClose,
  onApply,
  onApplyAuthored,
  authoredOnly = false,
  authoredTargetLabel = "this chord step",
  providerState = "idle",
  providerError = null,
  onRetryAudio,
  isPreviewPlaying = false,
  onPlayPreview,
  onStopPreview,
}: MelodyEditorDialogProps) {
  const pitchMotionRef = useRef<HTMLSelectElement | null>(null);
  const browseMotionsRef = useRef<HTMLButtonElement | null>(null);
  const galleryOpenRef = useRef(false);
  const [recipe, setRecipe] = useState<ChordMelodyRecipe>(DEFAULT_MELODY_RECIPE);
  const [instrumentOverride, setInstrumentOverride] = useState<MelodyInstrument | undefined>(
    step.melodyInstrumentOverride,
  );
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [targetSuggestions, setTargetSuggestions] = useState<readonly ExactPitch[]>([]);
  const [pendingTargetPitchClass, setPendingTargetPitchClass] = useState<number | undefined>();
  const [authoredMode, setAuthoredMode] = useState(false);
  const [authoredNotes, setAuthoredNotes] = useState<readonly AuthoredMelodyNote[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<readonly string[]>([]);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
  const [selectionFocusId, setSelectionFocusId] = useState<string | null>(null);
  const [draftPitch, setDraftPitch] = useState(60);
  const [draftOnsetNumerator, setDraftOnsetNumerator] = useState(0);
  const [draftOnsetDenominator, setDraftOnsetDenominator] = useState(1);
  const [draftDurationNumerator, setDraftDurationNumerator] = useState(1);
  const [draftDurationDenominator, setDraftDurationDenominator] = useState(1);

  const closeGallery = useCallback(() => {
    galleryOpenRef.current = false;
    setIsGalleryOpen(false);
    browseMotionsRef.current?.focus();
  }, []);

  const handleDialogClose = useCallback(() => {
    if (galleryOpenRef.current) {
      closeGallery();
      return;
    }
    onClose();
  }, [closeGallery, onClose]);

  const dialogRef = useModalFocus<HTMLElement>({
    isOpen,
    isTopmost: true,
    onClose: handleDialogClose,
    initialFocusRef: pitchMotionRef,
    ...(restoreFocusRef ? { restoreFocusRef } : {}),
  });

  useEffect(() => {
    if (!isOpen) return;
    setRecipe(
      step.melody?.mode === "generated"
        ? validateChordMelodyRecipe(step.melody.recipe)
        : step.melody?.mode === "authored" && step.melody.sourceRecipe
          ? validateChordMelodyRecipe(step.melody.sourceRecipe)
          : { ...DEFAULT_MELODY_RECIPE },
    );
    setInstrumentOverride(step.melodyInstrumentOverride);
    setAuthoredMode(authoredOnly || step.melody?.mode === "authored");
    setAuthoredNotes(
      step.melody?.mode === "authored"
        ? step.melody.phrase.notes.map((note) => ({
            ...note,
            pitch: pitchToConcertFrame(note.pitch, step),
          }))
        : [],
    );
    setEditingNoteId(null);
    setSelectedNoteIds([]);
    setSelectionAnchorId(null);
    setSelectionFocusId(null);
    setTargetSuggestions([]);
    setPendingTargetPitchClass(
      step.melody?.mode === "generated" ? step.melody.recipe.targetNextPitchClass : undefined,
    );
  }, [authoredOnly, isOpen, project.melodyTrack.instrument, step]);

  useEffect(() => {
    if (!isOpen) {
      galleryOpenRef.current = false;
      setIsGalleryOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    onStopPreview?.();
    return () => onStopPreview?.();
  }, [instrumentOverride, isOpen, onStopPreview, recipe, step.id]);

  const scalePitches = useMemo(
    () =>
      computeScalePitches(
        project.tonic,
        project.activeModule === "progressions" ? "ionian" : "aeolian",
      ),
    [project.activeModule, project.tonic],
  );

  const preview = useMemo(() => {
    if (!isOpen) return { kind: "closed" as const };
    try {
      const projectWithDraft = previewProject(project, step, recipe, instrumentOverride);
      const timeline = createMelodyTimeline(projectWithDraft);
      const lane = timeline.lanes.find((candidate) =>
        candidate.events.some((event) => event.sourceStepId === step.id),
      );
      return {
        kind: "ready" as const,
        project: projectWithDraft,
        timeline,
        ...(lane ? { lane } : {}),
        measures: (lane?.measures ?? timeline.measures).filter((measure) =>
          measure.entries.some((entry) => entry.kind === "note" && entry.sourceStepId === step.id),
        ),
      };
    } catch (error) {
      return {
        kind: "error" as const,
        message: error instanceof Error ? error.message : "Melody preview could not be realized",
      };
    }
  }, [instrumentOverride, isOpen, project, recipe, step]);

  if (!isOpen) return null;

  const title = mode === "create" ? "Create Melody" : "Edit Melody";
  const applyDisabled = preview.kind !== "ready";
  const setPitchMotion = (pitchMotion: MelodyPitchMotion) =>
    setRecipe((current) => ({ ...current, pitchMotion }));
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authoredMode) {
      return;
    }
    if (applyDisabled) return;
    onApply(recipe, instrumentOverride);
  };
  const protectAuthoredInputEnter = (event: React.KeyboardEvent<HTMLFormElement>) => {
    if (
      authoredMode &&
      event.key === "Enter" &&
      event.target instanceof Element &&
      event.target.closest("input, select, textarea, [contenteditable='true']")
    ) {
      // Enter in a field must not implicitly submit the authored draft.
      event.preventDefault();
    }
  };

  const saveAuthoredNote = () => {
    if (
      ![
        draftPitch,
        draftOnsetNumerator,
        draftOnsetDenominator,
        draftDurationNumerator,
        draftDurationDenominator,
      ].every(Number.isInteger) ||
      draftPitch < 0 ||
      draftPitch > 127 ||
      draftOnsetNumerator < 0 ||
      draftOnsetDenominator <= 0 ||
      draftDurationNumerator <= 0 ||
      draftDurationDenominator <= 0
    )
      return;
    const spellingSteps = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"] as const;
    const spellingAlters = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0] as const;
    const pitchClass = draftPitch % 12;
    const note: AuthoredMelodyNote = Object.freeze({
      id: editingNoteId ?? crypto.randomUUID(),
      pitch: exactPitch(draftPitch, {
        step: spellingSteps[pitchClass]!,
        alter: spellingAlters[pitchClass]!,
      }),
      onset: rational(draftOnsetNumerator, draftOnsetDenominator),
      duration: rational(draftDurationNumerator, draftDurationDenominator),
    });
    setAuthoredNotes((current) =>
      Object.freeze(
        [...current.filter((item) => item.id !== note.id), note].sort((a, b) =>
          compareRational(a.onset, b.onset),
        ),
      ),
    );
    setSelectedNoteIds([note.id]);
    setSelectionAnchorId(note.id);
    setSelectionFocusId(note.id);
    setEditingNoteId(null);
  };

  const updateSelectedPitches = (
    nextPitch: (midi: number, spelling: ExactPitch["spelling"]) => ExactPitch,
  ) => {
    if (selectedNoteIds.length === 0) return;
    const selected = new Set(selectedNoteIds);
    const notes = authoredNotes.map((note) =>
      selected.has(note.id)
        ? { ...note, pitch: nextPitch(note.pitch.midiNumber, note.pitch.spelling) }
        : note,
    );
    setAuthoredNotes(notes);
    const editedNote = notes.find((note) => note.id === editingNoteId);
    if (editedNote) setDraftPitch(editedNote.pitch.midiNumber);
  };

  const handleAuthoredKeyboard = (event: React.KeyboardEvent<HTMLOListElement>) => {
    if (
      event.ctrlKey ||
      event.metaKey ||
      (event.altKey && event.key !== "ArrowUp" && event.key !== "ArrowDown")
    )
      return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("[data-authored-note-action]") &&
      (event.key === "Enter" || event.key === " ")
    ) {
      return;
    }
    if (
      target instanceof Element &&
      target.closest('input, select, textarea, [contenteditable="true"]')
    )
      return;
    const noteIds = authoredNotes.map((note) => note.id);
    const focusedId =
      target instanceof Element
        ? target.closest<HTMLElement>("[data-authored-note-id]")?.dataset.authoredNoteId
        : undefined;
    const currentId = focusedId ?? selectionFocusId ?? selectedNoteIds.at(-1) ?? noteIds[0];
    const hasFocusedNote = selectionFocusId !== null || focusedId !== undefined;
    const currentIndex = hasFocusedNote && currentId ? noteIds.indexOf(currentId) : -1;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      if (noteIds.length === 0) return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextId =
        noteIds[
          currentIndex < 0 ? 0 : Math.max(0, Math.min(noteIds.length - 1, currentIndex + direction))
        ]!;
      if (event.shiftKey) {
        const anchor = selectionAnchorId ?? currentId ?? nextId;
        const from = noteIds.indexOf(anchor);
        const to = noteIds.indexOf(nextId);
        setSelectedNoteIds(noteIds.slice(Math.min(from, to), Math.max(from, to) + 1));
        setSelectionAnchorId(anchor);
      } else {
        setSelectedNoteIds([nextId]);
        setSelectionAnchorId(nextId);
      }
      setSelectionFocusId(nextId);
      setEditingNoteId(null);
      document
        .querySelector<HTMLButtonElement>(`[data-authored-note-id="${CSS.escape(nextId)}"]`)
        ?.focus();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? 1 : -1;
      if (selectedNoteIds.length === 0) {
        const current = exactPitch(Math.max(0, Math.min(127, draftPitch)), {
          step: "C",
          alter: 0,
        });
        const moved = event.altKey
          ? movePitchBySemitone(current, direction, scalePitches)
          : movePitchDiatonically(current, direction, scalePitches);
        setDraftPitch(moved.midiNumber);
        return;
      }
      updateSelectedPitches((midi, spelling) => {
        const current = exactPitch(midi, spelling);
        return event.altKey
          ? movePitchBySemitone(current, direction, scalePitches)
          : movePitchDiatonically(current, direction, scalePitches);
      });
      return;
    }
    if (/^[1-7]$/.test(event.key)) {
      event.preventDefault();
      const degree = Number(event.key);
      if (selectedNoteIds.length === 0) {
        setDraftPitch(pitchForScaleDegree(degree, scalePitches, draftPitch).midiNumber);
      } else {
        updateSelectedPitches((midi) => pitchForScaleDegree(degree, scalePitches, midi));
      }
      return;
    }
    if (event.key === "Delete" && selectedNoteIds.length > 0) {
      event.preventDefault();
      const selected = new Set(selectedNoteIds);
      const notes = authoredNotes.filter((note) => !selected.has(note.id));
      setAuthoredNotes(notes);
      setSelectedNoteIds([]);
      setSelectionAnchorId(null);
      setSelectionFocusId(null);
      setEditingNoteId(null);
      event.currentTarget.focus();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (editingNoteId) {
        saveAuthoredNote();
      } else if (selectedNoteIds[0]) {
        const note = authoredNotes.find((item) => item.id === selectedNoteIds[0]);
        if (note) {
          setEditingNoteId(note.id);
          setDraftPitch(note.pitch.midiNumber);
          setDraftOnsetNumerator(note.onset.numerator);
          setDraftOnsetDenominator(note.onset.denominator);
          setDraftDurationNumerator(note.duration.numerator);
          setDraftDurationDenominator(note.duration.denominator);
          document.querySelector<HTMLInputElement>('[aria-label="Authored pitch MIDI"]')?.focus();
        }
      } else if (selectedNoteIds.length === 0) {
        saveAuthoredNote();
      }
    }
  };

  const suggestTargetNotes = () => {
    const stepIndex = project.progression.steps.findIndex((candidate) => candidate.id === step.id);
    const nextStep = project.progression.steps
      .slice(stepIndex + 1)
      .find((candidate): candidate is ChordStep => candidate.kind === "chord");
    if (!nextStep) {
      setTargetSuggestions([]);
      setPendingTargetPitchClass(undefined);
      return;
    }
    const realization = realizeProgressionStepRealization(nextStep, project.tonic);
    const lastMelodyPitch =
      preview.kind === "ready"
        ? preview.timeline.events.filter((event) => event.sourceStepId === step.id).at(-1)?.pitch
            .midiNumber
        : undefined;
    const candidates = [
      ...realization.pitches,
      ...(realization.bassPitch ? [realization.bassPitch] : []),
    ];
    const unique = [
      ...new Map(candidates.map((pitch) => [targetPitchClass(pitch), pitch])).values(),
    ];
    unique.sort((a, b) => {
      if (lastMelodyPitch === undefined) return a.midiNumber - b.midiNumber;
      return (
        Math.abs(a.midiNumber - lastMelodyPitch) - Math.abs(b.midiNumber - lastMelodyPitch) ||
        a.midiNumber - b.midiNumber
      );
    });
    setTargetSuggestions(Object.freeze(unique));
    setPendingTargetPitchClass(
      step.melody?.mode === "generated" ? step.melody.recipe.targetNextPitchClass : undefined,
    );
  };

  const previewSelectedTarget = () => {
    if (pendingTargetPitchClass === undefined) return;
    setRecipe((current) => ({ ...current, targetNextPitchClass: pendingTargetPitchClass }));
  };

  const clearTargetNote = () => {
    setPendingTargetPitchClass(undefined);
    setRecipe((current) => {
      const { targetNextPitchClass: _target, ...withoutTarget } = current;
      return withoutTarget;
    });
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
            <p>
              {authoredMode
                ? `Authored notes belong to ${authoredTargetLabel}.`
                : "Generated from the contextual upper voicing of this Chord Step."}
            </p>
          </div>
          <div role="group" aria-label="Melody source">
            {!authoredOnly ? (
              <button
                type="button"
                className="secondary-btn"
                aria-pressed={!authoredMode}
                onClick={() => setAuthoredMode(false)}
              >
                Generated
              </button>
            ) : null}
            <button
              type="button"
              className="secondary-btn"
              aria-pressed={authoredMode}
              onClick={() => setAuthoredMode(true)}
            >
              Authored notes
            </button>
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
        <form onSubmit={handleSubmit} onKeyDownCapture={protectAuthoredInputEnter}>
          {authoredMode ? (
            <div className="dialog-body melody-editor-body" data-testid="authored-melody-editor">
              <fieldset className="melody-authored-fields">
                <legend>{editingNoteId ? "Edit note" : "Add note"}</legend>
                <label>
                  Pitch MIDI{" "}
                  <input
                    aria-label="Authored pitch MIDI"
                    type="number"
                    min="0"
                    max="127"
                    step="1"
                    value={draftPitch}
                    onChange={(event) => setDraftPitch(Number(event.target.value))}
                  />
                </label>
                <label>
                  Onset numerator{" "}
                  <input
                    aria-label="Authored onset numerator"
                    type="number"
                    min="0"
                    step="1"
                    value={draftOnsetNumerator}
                    onChange={(event) => setDraftOnsetNumerator(Number(event.target.value))}
                  />
                </label>
                <label>
                  Onset denominator{" "}
                  <input
                    aria-label="Authored onset denominator"
                    type="number"
                    min="1"
                    step="1"
                    value={draftOnsetDenominator}
                    onChange={(event) => setDraftOnsetDenominator(Number(event.target.value))}
                  />
                </label>
                <label>
                  Duration numerator{" "}
                  <input
                    aria-label="Authored duration numerator"
                    type="number"
                    min="1"
                    step="1"
                    value={draftDurationNumerator}
                    onChange={(event) => setDraftDurationNumerator(Number(event.target.value))}
                  />
                </label>
                <label>
                  Duration denominator{" "}
                  <input
                    aria-label="Authored duration denominator"
                    type="number"
                    min="1"
                    step="1"
                    value={draftDurationDenominator}
                    onChange={(event) => setDraftDurationDenominator(Number(event.target.value))}
                  />
                </label>
                <div className="melody-authored-actions">
                  <button type="button" className="secondary-btn" onClick={saveAuthoredNote}>
                    {editingNoteId ? "Update note" : "Add note"}
                  </button>
                  {editingNoteId ? (
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => setEditingNoteId(null)}
                    >
                      Cancel note edit
                    </button>
                  ) : null}
                </div>
              </fieldset>
              <p id="authored-keyboard-help" className="melody-authored-keyboard-help">
                Keyboard: focus a note, ←/→ selects and Shift+←/→ extends; ↑/↓ moves pitches in the
                active scale and Alt+↑/↓ moves by semitone. Keys 1–7 set the selected notes to scale
                degrees. Delete removes selected notes. Enter edits one selected note, or inserts
                from the onset and duration fields when none is selected. Changes stay here until
                Apply Melody.
              </p>
              <ol
                aria-label="Authored notes keyboard editor"
                aria-describedby="authored-keyboard-help"
                aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight ArrowUp ArrowDown Alt+ArrowUp Alt+ArrowDown 1 2 3 4 5 6 7 Delete Enter"
                data-testid="authored-note-list"
                tabIndex={0}
                onKeyDown={handleAuthoredKeyboard}
              >
                {authoredNotes.map((note) => (
                  <li key={note.id}>
                    <button
                      type="button"
                      className={`secondary-btn${selectedNoteIds.includes(note.id) ? " is-selected" : ""}`}
                      data-authored-note-id={note.id}
                      aria-pressed={selectedNoteIds.includes(note.id)}
                      onClick={() => {
                        setSelectedNoteIds([note.id]);
                        setSelectionAnchorId(note.id);
                        setSelectionFocusId(note.id);
                        setEditingNoteId(note.id);
                        setDraftPitch(note.pitch.midiNumber);
                        setDraftOnsetNumerator(note.onset.numerator);
                        setDraftOnsetDenominator(note.onset.denominator);
                        setDraftDurationNumerator(note.duration.numerator);
                        setDraftDurationDenominator(note.duration.denominator);
                      }}
                    >
                      Edit MIDI {note.pitch.midiNumber}, onset {note.onset.numerator}/
                      {note.onset.denominator}, duration {note.duration.numerator}/
                      {note.duration.denominator}
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      data-authored-note-action="delete"
                      aria-label={`Delete authored note ${note.id}`}
                      onClick={() => {
                        setAuthoredNotes((current) =>
                          current.filter((item) => item.id !== note.id),
                        );
                        setSelectedNoteIds((current) => current.filter((id) => id !== note.id));
                        if (selectionAnchorId === note.id) setSelectionAnchorId(null);
                        if (selectionFocusId === note.id) setSelectionFocusId(null);
                        if (editingNoteId === note.id) setEditingNoteId(null);
                      }}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="dialog-body melody-editor-body">
              <div className="melody-editor-fields">
                <label>
                  <span>Pitch Motion</span>
                  <div className="melody-pitch-motion-field">
                    <select
                      ref={pitchMotionRef}
                      aria-label="Pitch Motion"
                      value={recipe.pitchMotion}
                      onChange={(event) => setPitchMotion(event.target.value as MelodyPitchMotion)}
                    >
                      {MELODY_PITCH_MOTIONS.map((pitchMotion) => (
                        <option key={pitchMotion} value={pitchMotion}>
                          {MELODY_PITCH_MOTION_LABELS[pitchMotion]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="secondary-btn melody-pitch-motion-browse"
                      ref={browseMotionsRef}
                      aria-label="Browse motions"
                      aria-expanded={isGalleryOpen}
                      aria-controls="melody-pitch-motion-gallery"
                      onClick={() => {
                        galleryOpenRef.current = !isGalleryOpen;
                        setIsGalleryOpen((current) => !current);
                      }}
                    >
                      Browse motions
                    </button>
                  </div>
                  <span className="melody-pitch-motion-current">
                    Current: {MELODY_PITCH_MOTION_LABELS[recipe.pitchMotion]}
                  </span>
                </label>
                <label>
                  <span>Rhythm</span>
                  <select
                    aria-label="Rhythm"
                    value={recipe.rhythm}
                    onChange={(event) =>
                      setRecipe((current) => ({
                        ...current,
                        rhythm: event.target.value as ChordMelodyRecipe["rhythm"],
                      }))
                    }
                  >
                    {MELODY_RHYTHMS.map((rhythm) => (
                      <option key={rhythm} value={rhythm}>
                        {MELODY_RHYTHM_LABELS[rhythm]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Connection</span>
                  <select
                    aria-label="Connection"
                    value={recipe.connection}
                    onChange={(event) =>
                      setRecipe((current) => ({
                        ...current,
                        connection: event.target.value as ChordMelodyRecipe["connection"],
                      }))
                    }
                  >
                    {MELODY_CONNECTIONS.map((connection) => (
                      <option key={connection} value={connection}>
                        {MELODY_CONNECTION_LABELS[connection]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Grid</span>
                  <select
                    aria-label="Grid"
                    value={recipe.grid}
                    onChange={(event) =>
                      setRecipe((current) => ({
                        ...current,
                        grid: event.target.value as MelodyGrid,
                      }))
                    }
                  >
                    {MELODY_GRIDS.map((grid) => (
                      <option key={grid} value={grid}>
                        {MELODY_GRID_LABELS[grid]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Octave offset</span>
                  <select
                    aria-label="Octave offset"
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
                        {offset > 0 ? `+${offset}` : offset} octave
                        {Math.abs(offset) === 1 ? "" : "s"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Instrument</span>
                  <MelodyInstrumentPicker
                    value={instrumentOverride ?? project.melodyTrack.instrument}
                    allowInherit
                    trackInstrument={project.melodyTrack.instrument}
                    inherited={instrumentOverride === undefined}
                    ariaLabel="Melody Instrument"
                    onChange={setInstrumentOverride}
                  />
                </label>
              </div>
              <section
                className="melody-target-notes"
                aria-label="Target Notes"
                data-testid="melody-target-notes"
              >
                <div className="melody-target-notes-heading">
                  <div>
                    <strong>Target Notes</strong>
                    <span>Choose a note from the next chord for the phrase ending.</span>
                  </div>
                  <button
                    type="button"
                    className="secondary-btn"
                    data-testid="melody-target-suggest"
                    onClick={suggestTargetNotes}
                  >
                    Suggest
                  </button>
                </div>
                {targetSuggestions.length > 0 ? (
                  <div
                    className="melody-target-note-options"
                    role="group"
                    aria-label="Suggested target notes"
                  >
                    {targetSuggestions.map((pitch) => {
                      const pitchClass = targetPitchClass(pitch);
                      return (
                        <button
                          key={pitchClass}
                          type="button"
                          className={`secondary-btn melody-target-note-option${pendingTargetPitchClass === pitchClass ? " is-selected" : ""}`}
                          aria-pressed={pendingTargetPitchClass === pitchClass}
                          data-testid={`melody-target-option-${pitchClass}`}
                          onClick={() => setPendingTargetPitchClass(pitchClass)}
                        >
                          {targetPitchLabel(pitch)}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="melody-target-notes-empty" role="status">
                    Suggest notes from the next chord.
                  </p>
                )}
                <div className="melody-target-notes-actions">
                  <button
                    type="button"
                    className="secondary-btn"
                    data-testid="melody-target-preview"
                    disabled={pendingTargetPitchClass === undefined || applyDisabled}
                    onClick={previewSelectedTarget}
                  >
                    Preview selected target
                  </button>
                  {recipe.targetNextPitchClass !== undefined ? (
                    <button
                      type="button"
                      className="secondary-btn"
                      data-testid="melody-target-clear"
                      onClick={clearTargetNote}
                    >
                      Clear target
                    </button>
                  ) : null}
                  <span role="status" aria-live="polite" data-testid="melody-target-status">
                    {recipe.targetNextPitchClass !== undefined
                      ? `Phrase ending targets pitch class ${recipe.targetNextPitchClass}; preview remains a draft until Apply Melody.`
                      : "Preview and audition do not change the project."}
                  </span>
                </div>
              </section>
              {isGalleryOpen ? (
                <MelodyPitchMotionGallery
                  value={recipe.pitchMotion}
                  onChange={setPitchMotion}
                  onClose={closeGallery}
                />
              ) : null}
              <div className="melody-editor-preview" data-testid="melody-editor-preview">
                <div className="melody-editor-preview-heading">
                  <strong>Notation preview</strong>
                  <span>Concert pitch · Piano bass excluded</span>
                </div>
                <div className="melody-editor-audio-controls">
                  <button
                    type="button"
                    className="secondary-btn melody-editor-preview-icon-btn"
                    data-testid="melody-editor-preview-audio"
                    aria-label={isPreviewPlaying ? "Stop melody preview" : "Play melody preview"}
                    title={isPreviewPlaying ? "Stop melody preview" : "Play melody preview"}
                    disabled={
                      preview.kind !== "ready" ||
                      providerState === "loading" ||
                      providerState === "error" ||
                      !onPlayPreview
                    }
                    onClick={() => {
                      if (isPreviewPlaying) onStopPreview?.();
                      else if (preview.kind === "ready") onPlayPreview?.(preview.project);
                    }}
                  >
                    <Icon name={isPreviewPlaying ? "stop" : "play"} />
                  </button>
                  <span role={providerError && providerState === "error" ? "alert" : "status"}>
                    {providerError
                      ? `Melody audio ${providerState === "error" ? "error" : "warning"}: ${providerError}`
                      : providerState === "loading"
                        ? "Loading melody audio…"
                        : providerState === "ready"
                          ? "Melody audio ready"
                          : "Melody audio unavailable"}
                  </span>
                  {providerError && onRetryAudio ? (
                    <button type="button" className="melody-track-retry" onClick={onRetryAudio}>
                      Retry
                    </button>
                  ) : null}
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
                        {...(preview.lane ? { lane: preview.lane } : {})}
                        onSelectStep={() => undefined}
                      />
                    ))}
                  </div>
                ) : (
                  <p>No notation preview is available.</p>
                )}
              </div>
            </div>
          )}
          <footer className="dialog-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type={authoredMode ? "button" : "submit"}
              className="primary-btn"
              data-testid="melody-editor-apply"
              onClick={authoredMode ? () => onApplyAuthored?.({ notes: authoredNotes }) : undefined}
              disabled={authoredMode ? !onApplyAuthored : applyDisabled}
            >
              Apply Melody
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
