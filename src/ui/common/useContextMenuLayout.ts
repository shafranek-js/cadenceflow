import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * Shared plumbing for the context menus (progression, score system, matrix).
 *
 * Those three menus independently duplicated the same two pieces of logic, and the copies had
 * drifted: `ProgressionContextMenu` measured its own width in a layout effect, while the other
 * two read `menuRef.current?.getBoundingClientRect()` **during render**. That is a real defect,
 * not just a lint complaint: on the first paint the ref is still `null`, so both fell back to a
 * hard-coded `220` and positioned their submenus from a guessed width, then jumped on the next
 * render once the real width was known.
 */

export interface ContextMenuItemRefs {
  /** Stable across renders, so it may be passed straight to `ref`. */
  readonly registerRef: (index: number) => (node: HTMLButtonElement | null) => void;
  /** The registered nodes, for keyboard navigation in event handlers and effects. */
  readonly itemRefs: RefObject<Array<HTMLButtonElement | null>>;
  /** Call from the menu container's `ref` to enable width measurement. */
  readonly menuRef: RefObject<HTMLDivElement | null>;
  /** Measured menu width, falling back to `fallbackWidth` until the first layout effect runs. */
  readonly menuWidth: number;
}

/**
 * Tracks the menu's item buttons and its rendered width.
 *
 * @param fallbackWidth width to assume before the menu has been measured
 */
export function useContextMenuLayout(fallbackWidth = 220): ContextMenuItemRefs {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuWidth, setMenuWidth] = useState(fallbackWidth);

  const registerRef = useCallback(
    (index: number) => (node: HTMLButtonElement | null) => {
      // A ref callback runs during commit, not during render, so writing the collection here is
      // correct. It is only read by keyboard handlers and effects. (`useContextMenuLayout` is
      // written this way rather than with a plain curried function because the React Compiler
      // rule cannot see through the callback and reports a render-time ref access that is not
      // there; with `useCallback` wrapping it, no suppression is needed.)
      itemRefs.current[index] = node;
    },
    [],
  );

  // Measured once per mount: this hook is used by context menus, which are mounted in order to
  // be shown, so content does not change under them. Resetting in the cleanup also stops a menu
  // that happens to remount from inheriting the previous menu's width for one frame.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (menu) {
      setMenuWidth(menu.getBoundingClientRect().width);
    }
    return () => setMenuWidth(fallbackWidth);
  }, [fallbackWidth]);

  return { registerRef, itemRefs, menuRef, menuWidth };
}
