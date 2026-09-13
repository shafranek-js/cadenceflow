import type { RestStep, ProgressionStep } from "../../domain/progression/step";
import type { MusicalDuration } from "../../domain/timing/duration";
import type { Meter, MeterChangePolicy } from "../../domain/timing/meter";
import type { GrooveSettings } from "../../domain/timing/swing";
import type { LoopMode, LoopState } from "../transport/loopState";
import { Icon } from "../common/Icon";
import { StepDurationControl } from "../progression/StepDurationControl";
import { formatDurationBeats } from "../timing/stepDuration";
import { InspectorProgressionSettings } from "./InspectorProgressionSettings";

export interface RestStepInspectorProps {
  readonly step: RestStep;
  readonly meter: Meter;
  readonly onDurationChange: (duration: MusicalDuration) => void;
  readonly onRemove: () => void;
  readonly onMoveLeft: () => void;
  readonly onMoveRight: () => void;
  readonly onSetMeter?: (meter: Meter, policy: MeterChangePolicy) => void;
  readonly groove?: GrooveSettings;
  readonly onSetGroove?: (groove: GrooveSettings) => void;
  readonly loopState?: LoopState;
  readonly steps?: readonly ProgressionStep[];
  readonly onSetLoopMode?: (mode: LoopMode) => void;
  readonly onSetLoopRange?: ((startStepId: string, endStepId: string) => void) | undefined;
}

export function RestStepInspector({
  step,
  meter,
  onDurationChange,
  onRemove,
  onMoveLeft,
  onMoveRight,
  onSetMeter,
  groove,
  onSetGroove,
  loopState,
  steps,
  onSetLoopMode,
  onSetLoopRange,
}: RestStepInspectorProps) {
  return (
    <section
      className="piano-performance-inspector selected-rest-inspector"
      aria-label="Settings for selected Rest step"
      data-context="selected-step"
      data-testid="step-performance-inspector"
    >
      <header className="performance-inspector-header">
        <div>
          <span className="inspector-context-kicker">Selected step</span>
          <h3>Rest</h3>
          <span>Step-specific controls live here. Progression settings are grouped below.</span>
        </div>
      </header>

      <div className="step-actions" aria-label="Rest step actions">
        <button type="button" onClick={onMoveLeft} aria-label="Move step left">
          <Icon name="move-left" />
        </button>
        <button type="button" onClick={onMoveRight} aria-label="Move step right">
          <Icon name="move-right" />
        </button>
        <button type="button" onClick={onRemove}>
          Remove
        </button>
      </div>

      <div
        className="transport-section transport-step-duration inspector-group selected-step-duration"
        role="group"
        aria-label="Step duration controls"
      >
        <span className="transport-label">
          Step Duration ({formatDurationBeats(step.duration)})
        </span>
        <StepDurationControl
          variant="buttons"
          value={step.duration}
          meter={meter}
          includeFullBar
          onChange={onDurationChange}
        />
      </div>

      <InspectorProgressionSettings
        meter={meter}
        onSetMeter={onSetMeter}
        groove={groove}
        onSetGroove={onSetGroove}
        loopState={loopState}
        steps={steps}
        onSetLoopMode={onSetLoopMode}
        onSetLoopRange={onSetLoopRange}
      />
    </section>
  );
}
