import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function activateFromKeyboard(
  event: ReactKeyboardEvent<HTMLElement>,
  activate: () => void,
): void {
  if (event.target !== event.currentTarget) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  activate();
}
