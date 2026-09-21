import type { HarmonicRouteDecision } from "../../domain/harmony/routing";
import { useModalFocus } from "../common/useModalFocus";

export function RouteWarningDialog({
  decision,
  onCancel,
  onConfirm,
}: {
  readonly decision: HarmonicRouteDecision;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const dialogRef = useModalFocus<HTMLElement>({
    isOpen: true,
    onClose: onCancel,
  });

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <section
        ref={dialogRef}
        className="route-warning-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="route-warning-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="route-warning-title">Confirm harmonic route</h2>
        <p data-testid="route-warning-message">{decision.message}</p>
        <p className="route-warning-note">
          The visible card remains available, but this transition is outside the strict routing
          recommendation.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} data-testid="route-add-anyway">
            Add anyway
          </button>
        </div>
      </section>
    </div>
  );
}
