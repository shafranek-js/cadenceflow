import type { RestStep } from "../../domain/progression/step";
import type { MusicalDuration } from "../../domain/timing/duration";
import type { Meter } from "../../domain/timing/meter";
import { Icon } from "../common/Icon";
import { StepDurationControl } from "../progression/StepDurationControl";

export function RestStepInspector({
  step,
  meter,
  onDurationChange,
  onRemove,
  onMoveLeft,
  onMoveRight,
}: {
  readonly step: RestStep;
  readonly meter: Meter;
  readonly onDurationChange: (duration: MusicalDuration) => void;
  readonly onRemove: () => void;
  readonly onMoveLeft: () => void;
  readonly onMoveRight: () => void;
}) {
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
          <span>All selected-step settings live here.</span>
        </div>
      </header>

      <div
        className="inspector-group selected-step-duration"
        role="group"
        aria-label="Step duration controls"
      >
        <StepDurationControl
          variant="buttons"
          value={step.duration}
          meter={meter}
          includeFullBar
          onChange={onDurationChange}
        />
      </div>

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
    </section>
  );
}
