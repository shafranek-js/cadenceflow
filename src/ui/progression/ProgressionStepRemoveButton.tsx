export function ProgressionStepRemoveButton({
  accessibleName,
  onRemove,
}: {
  readonly accessibleName: string;
  readonly onRemove: () => void;
}) {
  return (
    <button
      type="button"
      className="progression-step-remove-button"
      data-testid="progression-step-remove"
      aria-label={accessibleName}
      title="Remove Step"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onRemove();
      }}
    >
      <span aria-hidden="true">×</span>
    </button>
  );
}
