import { useCallback, useState } from "react";

/**
 * Shared fold/unfold state for inspector sidebar sections.
 *
 * Sections default to open and remember their state per section in `localStorage`, best-effort:
 * unavailable storage (private mode, SSR, disabled storage) never breaks rendering.
 */

/** Reads a persisted disclosure preference, falling back when storage is unavailable. */
export function readInspectorDisclosureState(storageKey: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored === null ? fallback : stored === "true";
  } catch {
    return fallback;
  }
}

/** Persists a disclosure preference, best-effort when storage is unavailable. */
export function persistInspectorDisclosureState(storageKey: string, open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, String(open));
  } catch {
    // Disclosure preferences are best-effort when storage is unavailable.
  }
}

export interface InspectorDisclosureState {
  readonly isOpen: boolean;
  /** Sets the state and persists it; used by `<details>`-based sections via `onToggle`. */
  readonly setOpen: (open: boolean) => void;
  /** Flips the state and persists it; used by button-based section headers. */
  readonly toggle: () => void;
}

/**
 * `useInspectorDisclosure` is the single source of truth for section folding: every inspector
 * section (button headers and `<details>` summaries alike) persists through this hook.
 *
 * A `null` storage key keeps the state in memory only, which is what optional section keys need.
 */
export function useInspectorDisclosure(
  storageKey: string | null,
  fallback = true,
): InspectorDisclosureState {
  const [isOpen, setIsOpen] = useState<boolean>(() =>
    storageKey === null ? fallback : readInspectorDisclosureState(storageKey, fallback),
  );

  const setOpen = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (storageKey !== null) persistInspectorDisclosureState(storageKey, open);
    },
    [storageKey],
  );

  const toggle = useCallback(() => {
    setIsOpen((previous) => {
      const next = !previous;
      if (storageKey !== null) persistInspectorDisclosureState(storageKey, next);
      return next;
    });
  }, [storageKey]);

  return { isOpen, setOpen, toggle };
}
