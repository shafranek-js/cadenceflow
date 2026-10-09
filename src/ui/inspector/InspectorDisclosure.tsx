import type { ReactNode } from "react";
import { Icon } from "../common/Icon";

/**
 * Shared disclosure toggle for inspector sidebar sections — the same `<button>` +
 * rotating chevron + `aria-expanded` affordance used by the Sound Engines header.
 *
 * Fold state itself lives in `useInspectorDisclosure` so button-based and
 * `<details>`-based sections share one persistence path.
 */
export interface InspectorDisclosureToggleProps {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  /** Visible title rendered inside the toggle, as in the Sound Engines header. */
  readonly label?: ReactNode;
  /** Accessible name for icon-only toggles that sit next to an existing heading. */
  readonly ariaLabel?: string;
  /** Id of the collapsible body, wired to `aria-controls`. */
  readonly controlsId?: string;
  readonly testId?: string;
  readonly className?: string;
}

export function InspectorDisclosureToggle({
  isOpen,
  onToggle,
  label,
  ariaLabel,
  controlsId,
  testId,
  className,
}: InspectorDisclosureToggleProps) {
  return (
    <button
      type="button"
      className={
        className === undefined
          ? "inspector-disclosure-toggle"
          : `inspector-disclosure-toggle ${className}`
      }
      onClick={onToggle}
      aria-expanded={isOpen}
      {...(ariaLabel === undefined ? {} : { "aria-label": ariaLabel })}
      {...(controlsId === undefined ? {} : { "aria-controls": controlsId })}
      {...(testId === undefined ? {} : { "data-testid": testId })}
    >
      <Icon name="disclosure" className={isOpen ? "is-rotated" : ""} />
      {label === undefined ? null : <span className="inspector-panel-title">{label}</span>}
    </button>
  );
}
