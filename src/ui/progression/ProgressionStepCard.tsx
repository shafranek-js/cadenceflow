import type { PitchClassIdentity } from "../../domain/harmony/pitch";
import { formatChordSymbol } from "../../domain/harmony/chord";
import { realizeChord } from "../../domain/harmony/realization";
import type { ChordStep, StepPerformance } from "../../domain/progression/step";
import type { KeyboardEvent, MouseEvent } from "react";
import { realizeProgressionStepRealization } from "../../instruments/piano/profile";
import { formatMusicalDuration } from "../../domain/timing/duration";
import { PianoCardView } from "../piano/PianoCardView";
import { StaffCardView } from "../staff/StaffCardView";
import { ProgressionStepRemoveButton } from "./ProgressionStepRemoveButton";
import { Icon } from "../common/Icon";
import {
  canShiftPerformanceOctave,
  performanceOctaveShiftPatch,
  type StaffOctaveDirection,
} from "../staff/staffOctave";

export function ProgressionStepCard({
  step,
  stepNumber = 1,
  tonic,
  compactStaff = false,
  selected,
  playing = false,
  inLoop = false,
  showBassInStaff = false,
  onSelect,
  onPerformanceChange,
  onRemove,
  onOpenMelodyMenu,
}: {
  readonly step: ChordStep;
  readonly stepNumber?: number;
  readonly tonic: PitchClassIdentity;
  readonly compactStaff?: boolean;
  readonly selected: boolean;
  readonly playing?: boolean;
  readonly inLoop?: boolean;
  readonly showBassInStaff?: boolean;
  readonly onSelect: () => void;
  readonly onPerformanceChange: (performance: Partial<StepPerformance>) => void;
  readonly onRemove: () => void;
  readonly onOpenMelodyMenu?: (
    anchor: HTMLElement,
    position?: { readonly x: number; readonly y: number },
  ) => void;
}) {
  const realization = realizeProgressionStepRealization(step, tonic);
  // Piano Card View is chord-only. The realization's bassPitch remains available to audio.
  const pianoPitches = realization.pitches;
  const staffPitches =
    showBassInStaff && realization.bassPitch
      ? Object.freeze([realization.bassPitch, ...pianoPitches])
      : pianoPitches;
  const chordLabel = formatChordSymbol({
    ...realizeChord(step.harmonicFunction, tonic),
    variant: step.harmonicVariant,
  });
  const durationLabel = formatMusicalDuration(step.duration);
  const selectionAriaLabel = `Select progression step ${stepNumber}: ${step.harmonicFunction.functionId}${playing ? ", Playing" : ""}`;
  const changeStaffOctave = (direction: StaffOctaveDirection) => {
    const patch = performanceOctaveShiftPatch(step.performance, direction);
    if (patch) onPerformanceChange(patch);
  };
  const openMelodyMenuFromPointer = (event: MouseEvent<HTMLElement>) => {
    if (!onOpenMelodyMenu) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const anchor = target?.closest<HTMLElement>("[data-progression-step-select]") ?? null;
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
    onOpenMelodyMenu(anchor, { x: event.clientX, y: event.clientY });
  };
  const openMelodyMenuFromKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (!onOpenMelodyMenu) return;
    if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const anchor = target?.closest<HTMLElement>("[data-progression-step-select]") ?? null;
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
      {step.cardView === "staff" && !compactStaff ? (
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
          {playing ? (
            <span className="step-state-indicator playing-indicator" aria-hidden="true">
              <Icon name="play" /> Playing
            </span>
          ) : null}
          <span className="step-view">
            {step.cardView === "harmonic" ? (
              <>
                <strong data-testid="step-function">{step.harmonicFunction.functionId}</strong>
                <span>
                  {step.performance.articulation} · v{step.performance.masterVelocity} ·{" "}
                  {durationLabel}
                </span>
              </>
            ) : null}
            {step.cardView === "piano" ? (
              <PianoCardView chordPitches={pianoPitches} chordLabel={chordLabel} />
            ) : null}
            {step.cardView === "staff" ? (
              <span className="compact-staff-label">
                <strong>{chordLabel}</strong>
                <small>{durationLabel}</small>
              </span>
            ) : null}
          </span>
        </button>
      )}
    </article>
  );
}
