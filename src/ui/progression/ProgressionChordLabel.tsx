import type { ReactNode } from "react";
import type { LabelHierarchyMode } from "./labelHierarchy";

export function ProgressionChordLabel({
  mode,
  functionLabel,
  chordLabel,
  className = "",
}: {
  readonly mode: LabelHierarchyMode;
  readonly functionLabel: string;
  readonly chordLabel: string;
  readonly className?: string;
}): ReactNode {
  const classNames = `progression-chord-label progression-chord-label-${mode} ${className}`.trim();
  if (mode === "inline") {
    return (
      <span className={classNames} data-label-mode={mode} data-testid="progression-chord-label">
        <strong className="progression-chord-label-primary progression-chord-label-chord">
          {chordLabel}
        </strong>{" "}
        <span
          className="progression-chord-label-secondary progression-chord-label-function"
          data-testid="step-function"
        >
          ({functionLabel})
        </span>
      </span>
    );
  }

  const functionIsPrimary = mode === "function-first";
  return (
    <span className={classNames} data-label-mode={mode} data-testid="progression-chord-label">
      {functionIsPrimary ? (
        <strong
          className="progression-chord-label-primary progression-chord-label-function"
          data-testid="step-function"
        >
          {functionLabel}
        </strong>
      ) : (
        <strong className="progression-chord-label-primary progression-chord-label-chord">
          {chordLabel}
        </strong>
      )}
      {functionIsPrimary ? (
        <span className="progression-chord-label-secondary progression-chord-label-chord">
          {chordLabel}
        </span>
      ) : (
        <span
          className="progression-chord-label-secondary progression-chord-label-function"
          data-testid="step-function"
        >
          {functionLabel}
        </span>
      )}
    </span>
  );
}
