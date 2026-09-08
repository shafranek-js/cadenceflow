import { useEffect, useRef, type RefObject } from "react";
import { FOCUSABLE_SELECTOR } from "../studio/focusManagement";

export interface UseModalFocusOptions {
  readonly isOpen: boolean;
  readonly isTopmost?: boolean;
  readonly onClose: () => void;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly restoreFocusRef?: RefObject<HTMLElement | null>;
}

export function useModalFocus<T extends HTMLElement = HTMLElement>({
  isOpen,
  isTopmost = true,
  onClose,
  initialFocusRef,
  restoreFocusRef,
}: UseModalFocusOptions): RefObject<T | null> {
  const containerRef = useRef<T>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Capture currently focused element before opening/trapping
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    // Place initial focus after component mounts
    const frameId = requestAnimationFrame(() => {
      if (!isTopmost) return;

      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }

      if (containerRef.current) {
        const firstFocusable = containerRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          containerRef.current.focus();
        }
      }
    });

    const explicitRestoreNode = restoreFocusRef?.current;
    return () => {
      cancelAnimationFrame(frameId);
      // Restore focus on close if we are closing the dialog
      const elementToRestore = explicitRestoreNode ?? previousActiveElementRef.current;
      if (elementToRestore && typeof elementToRestore.focus === "function") {
        elementToRestore.focus();
      }
    };
  }, [isOpen, isTopmost, initialFocusRef, restoreFocusRef]);

  // Handle Tab focus trap and Escape key
  useEffect(() => {
    if (!isOpen || !isTopmost) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== "Tab") return;

      const container = containerRef.current;
      if (!container) return;

      const focusableElements = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => {
        if (el.closest("[inert]") || el.getAttribute("aria-hidden") === "true") {
          return false;
        }
        if (
          typeof el.offsetParent !== "undefined" &&
          el.offsetParent === null &&
          el.getClientRects().length === 0
        ) {
          // In jsdom offsetParent is always null for rendered DOM nodes; don't filter out in jsdom
          return typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom");
        }
        return true;
      });

      if (focusableElements.length === 0) {
        e.preventDefault();
        return;
      }

      const firstElement = focusableElements[0]!;
      const lastElement = focusableElements[focusableElements.length - 1]!;

      if (e.shiftKey) {
        // Shift + Tab: if on first element, wrap to last
        if (
          document.activeElement === firstElement ||
          !container.contains(document.activeElement)
        ) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: if on last element, wrap to first
        if (document.activeElement === lastElement || !container.contains(document.activeElement)) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, isTopmost, onClose]);

  return containerRef;
}
