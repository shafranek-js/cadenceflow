export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const APP_SHORTCUT_PROTECTED_SELECTOR =
  'input:not([type="hidden"]), select, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"], [role="dialog"], [role="menu"], [role^="menuitem"], .piano-roll-system-chord-panel, .piano-roll-system-note-panel';

/** Returns true when an application shortcut must yield to the focused control or overlay. */
export function isAppShortcutProtectedTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(APP_SHORTCUT_PROTECTED_SELECTOR));
}
