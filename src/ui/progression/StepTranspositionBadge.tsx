import type { ReactNode } from "react";

export function StepTranspositionBadge({
  semitones,
  className = "",
}: {
  readonly semitones: number;
  readonly className?: string;
}): ReactNode {
  if (semitones === 0) return null;
  const amount = `${semitones > 0 ? "+" : ""}${semitones}`;
  return (
    <small
      className={`step-transposition-badge ${className}`.trim()}
      data-testid="step-transposition-indicator"
      aria-label={`Local transposition ${amount} semitones`}
      title={`Local transposition ${amount} semitones`}
    >
      {amount} st
    </small>
  );
}
