export function StepActions({ canReplace, onReplace, onReset, onRemove, onMoveLeft, onMoveRight }: {
  readonly canReplace: boolean;
  readonly onReplace: () => void;
  readonly onReset: () => void;
  readonly onRemove: () => void;
  readonly onMoveLeft: () => void;
  readonly onMoveRight: () => void;
}) {
  return <div className="step-actions"><button type="button" disabled={!canReplace} onClick={onReplace}>Replace Step</button><button type="button" onClick={onReset}>Reset Performance</button><button type="button" onClick={onMoveLeft} aria-label="Move step left">←</button><button type="button" onClick={onMoveRight} aria-label="Move step right">→</button><button type="button" onClick={onRemove}>Remove</button></div>;
}
