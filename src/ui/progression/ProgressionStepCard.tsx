import type { PitchClassIdentity } from "../../domain/harmony/pitch";
import { formatChordSymbol } from "../../domain/harmony/chord";
import { formatPitchSpelling } from "../../domain/harmony/spelling";
import { withEffectiveBass } from "../../domain/progression/effectiveChord";
import type { ChordStep, StepPerformance } from "../../domain/progression/step";
import type {
  GuitarChordColorMode,
  NoteColorMode,
  ProgressionView,
} from "../../domain/project/project";
import type { HarmonicModuleId } from "../../domain/harmony/functions";
import type { KeyboardEvent, MouseEvent } from "react";
import { realizeProgressionStepRealization } from "../../instruments/piano/profile";
import {
  realizeProgressionStepChord,
  stepTranspositionSemitones,
} from "../../domain/progression/transposition";
import { formatMusicalDuration } from "../../domain/timing/duration";
import { createHarmonicNoteRoleContext } from "../../domain/harmony/noteRoles";
import { PianoCardView } from "../piano/PianoCardView";
import { GuitarCardView } from "../guitar/GuitarCardView";
import { TabCardView } from "../guitar/TabCardView";
import { StaffCardView } from "../staff/StaffCardView";
import { ProgressionStepRemoveButton } from "./ProgressionStepRemoveButton";
import {
  canShiftPerformanceOctave,
  performanceOctaveShiftPatch,
  type StaffOctaveDirection,
} from "../staff/staffOctave";
import type { LabelHierarchyMode } from "./labelHierarchy";
import { ProgressionChordLabel } from "./ProgressionChordLabel";
import { StepTranspositionBadge } from "./StepTranspositionBadge";

export function ProgressionStepCard({
  step,
  stepNumber = 1,
  tonic,
  view = "harmonic",
  labelMode,
  compactStaff = false,
  selected,
  playing = false,
  inLoop = false,
  showBassInStaff = false,
  suzukiColors = false,
  noteColorMode = suzukiColors ? "suzuki" : "standard",
  activeModule = "progressions",
  nextStep,
  guitarChordOrientation = "vertical",
  guitarChordColorMode = "chord-roles",
  onSelect,
  onPerformanceChange,
  onRemove,
  onOpenMelodyMenu,
}: {
  readonly step: ChordStep;
  readonly stepNumber?: number;
  readonly tonic: PitchClassIdentity;
  /** Global My Progression view; legacy step.cardView is intentionally ignored. */
  readonly view?: ProgressionView;
  /** Session-only label hierarchy; omitted for legacy/direct component callers. */
  readonly labelMode?: LabelHierarchyMode;
  readonly compactStaff?: boolean;
  readonly selected: boolean;
  readonly playing?: boolean;
  readonly inLoop?: boolean;
  readonly showBassInStaff?: boolean;
  readonly suzukiColors?: boolean;
  readonly noteColorMode?: NoteColorMode;
  readonly activeModule?: HarmonicModuleId;
  readonly nextStep?: ChordStep | undefined;
  readonly guitarChordOrientation?: "vertical" | "horizontal";
  readonly guitarChordColorMode?: GuitarChordColorMode;
  readonly onSelect: () => void;
  readonly onPerformanceChange: (performance: Partial<StepPerformance>) => void;
  readonly onRemove: () => void;
  readonly onOpenMelodyMenu?: (
    anchor: HTMLElement,
    position?: { readonly x: number; readonly y: number },
  ) => void;
}) {
  const realization = realizeProgressionStepRealization(step, tonic);
  const baseChord = realizeProgressionStepChord(step, tonic);
  // Piano Card View is chord-only. The realization's bassPitch remains available to audio.
  const pianoPitches = realization.pitches;
  const displayedChord = withEffectiveBass(baseChord, realization.bassPitch);
  const nextRealization = nextStep ? realizeProgressionStepRealization(nextStep, tonic) : undefined;
  const roleContext = createHarmonicNoteRoleContext({
    tonic,
    moduleId: activeModule,
    rootPitchClass: baseChord.rootPitchClass,
    chordPitches: [...pianoPitches, ...(realization.bassPitch ? [realization.bassPitch] : [])],
    nextChordPitches: nextRealization
      ? [
          ...nextRealization.pitches,
          ...(nextRealization.bassPitch ? [nextRealization.bassPitch] : []),
        ]
      : [],
  });
  const chordLabel = formatChordSymbol(displayedChord);
  const isInvertedBass =
    realization.bassPitch !== undefined &&
    realization.bassPitch.pitchClassIdentity !== baseChord.rootPitchClass;
  const staffPitches =
    (showBassInStaff || isInvertedBass) && realization.bassPitch
      ? Object.freeze([realization.bassPitch, ...pianoPitches])
      : pianoPitches;
  const durationLabel = formatMusicalDuration(step.duration);
  const selectionAriaLabel = `Select progression step ${stepNumber}: ${step.harmonicFunction.functionId}${playing ? ", Playing" : ""}`;
  const changeStaffOctave = (direction: StaffOctaveDirection) => {
    const patch = performanceOctaveShiftPatch(step.performance, direction);
    if (patch) onPerformanceChange(patch);
  };
  const openMelodyMenuFromPointer = (event: MouseEvent<HTMLElement>) => {
    if (!onOpenMelodyMenu) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const anchor =
      target?.closest<HTMLElement>("[data-progression-step-select]") ??
      event.currentTarget.querySelector<HTMLElement>("[data-progression-step-select]");
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
    onOpenMelodyMenu(anchor, { x: event.clientX, y: event.clientY });
  };
  const openMelodyMenuFromKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (!onOpenMelodyMenu) return;
    if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const anchor =
      target?.closest<HTMLElement>("[data-progression-step-select]") ??
      event.currentTarget.querySelector<HTMLElement>("[data-progression-step-select]");
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = anchor.getBoundingClientRect();
    onOpenMelodyMenu(anchor, { x: rect.left, y: rect.bottom });
  };

  return (
    <article
      className={`progression-step-card ${selected ? "is-selected" : ""} ${playing ? "is-playing" : ""} ${inLoop ? "is-in-loop" : ""}`}
      data-testid="progression-step"
      data-selected={selected ? "true" : undefined}
      data-playing={playing ? "true" : undefined}
      data-in-loop={inLoop ? "true" : undefined}
      onClick={onSelect}
      onContextMenu={openMelodyMenuFromPointer}
      onKeyDown={openMelodyMenuFromKeyboard}
    >
      <span
        className="progression-step-number"
        data-testid="progression-step-number"
        aria-hidden="true"
      >
        {stepNumber}
      </span>
      <ProgressionStepRemoveButton
        accessibleName={`Remove progression step ${stepNumber}: ${step.harmonicFunction.functionId}`}
        onRemove={onRemove}
      />
      {view === "staff" && !compactStaff ? (
        <StaffCardView
          className="progression-step-select-button"
          pitches={staffPitches}
          chordPitches={pianoPitches}
          chordLabel={chordLabel}
          duration={step.duration}
          selected={selected}
          playing={playing}
          selectionAriaLabel={selectionAriaLabel}
          stepId={step.id}
          canShiftUp={canShiftPerformanceOctave(step.performance, 1)}
          canShiftDown={canShiftPerformanceOctave(step.performance, -1)}
          onSelect={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          hasContextMenu={Boolean(onOpenMelodyMenu)}
          suzukiColors={noteColorMode === "suzuki"}
          onOctaveChange={changeStaffOctave}
        />
      ) : (
        <button
          type="button"
          className="progression-step-select-button"
          data-progression-step-select
          data-step-id={step.id}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          aria-label={selectionAriaLabel}
          aria-pressed={selected}
          aria-current={playing ? "step" : undefined}
          aria-haspopup={onOpenMelodyMenu ? "menu" : undefined}
        >
          <span className="step-view">
            {view === "harmonic" ? (
              <>
                {labelMode ? (
                  <ProgressionChordLabel
                    mode={labelMode}
                    functionLabel={step.harmonicFunction.functionId}
                    chordLabel={chordLabel}
                  />
                ) : (
                  <strong data-testid="step-function">
                    {step.harmonicFunction.functionId}
                    {isInvertedBass ? (
                      <span className="step-inversion-badge">
                        /{formatPitchSpelling(realization.bassPitch!.spelling)}
                      </span>
                    ) : null}
                  </strong>
                )}
                <span>
                  {!labelMode && isInvertedBass ? `${chordLabel} · ` : ""}
                  {step.performance.articulation} · v{step.performance.masterVelocity} ·{" "}
                  {durationLabel}
                </span>
              </>
            ) : null}
            {view === "piano" ? (
              <PianoCardView
                chordPitches={pianoPitches}
                bassPitch={isInvertedBass ? realization.bassPitch : undefined}
                chordLabel={chordLabel}
                {...(labelMode
                  ? { labelMode, functionLabel: step.harmonicFunction.functionId }
                  : {})}
                noteColorMode={noteColorMode}
                roleContext={roleContext}
              />
            ) : null}
            {view === "guitar" ? (
              <GuitarCardView
                chord={displayedChord}
                chordLabel={chordLabel}
                {...(labelMode
                  ? { labelMode, functionLabel: step.harmonicFunction.functionId }
                  : {})}
                orientation={guitarChordOrientation}
                colorMode={guitarChordColorMode}
              />
            ) : null}
            {view === "tablature" ? (
              <TabCardView
                chord={displayedChord}
                chordLabel={chordLabel}
                {...(labelMode
                  ? { labelMode, functionLabel: step.harmonicFunction.functionId }
                  : {})}
                duration={step.duration}
                articulation={step.performance.articulation}
                playing={playing}
              />
            ) : null}
            {view === "staff" ? (
              <span className="compact-staff-label">
                {labelMode ? (
                  <ProgressionChordLabel
                    mode={labelMode}
                    functionLabel={step.harmonicFunction.functionId}
                    chordLabel={chordLabel}
                  />
                ) : (
                  <strong>{chordLabel}</strong>
                )}
                <small>{durationLabel}</small>
              </span>
            ) : null}
          </span>
          <StepTranspositionBadge
            semitones={step.kind === "chord" ? stepTranspositionSemitones(step) : 0}
          />
        </button>
      )}
    </article>
  );
}
