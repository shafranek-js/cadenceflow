import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface PianoRollSelectionActionProps {
  readonly accessibleName: string;
  readonly title: string;
  readonly testId: string;
  readonly selectionScopeLabel: string;
  readonly onSelect: () => void;
  readonly children: ReactNode;
}

/** A compact, independently targetable note-selection action with keyboard help. */
export function PianoRollSelectionAction({
  accessibleName,
  title,
  testId,
  selectionScopeLabel,
  onSelect,
  children,
}: PianoRollSelectionActionProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpPosition, setHelpPosition] = useState({ left: 12, top: 12 });
  const controlRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const helpRef = useRef<HTMLElement>(null);
  const helpCloseTimeoutRef = useRef<number | null>(null);
  const suppressNextFocusHelpRef = useRef(false);
  const suppressPointerHelpRef = useRef(false);
  const helpId = `piano-roll-selection-help-${useId().replaceAll(":", "")}`;
  const clearHelpCloseTimeout = () => {
    if (helpCloseTimeoutRef.current === null) return;
    window.clearTimeout(helpCloseTimeoutRef.current);
    helpCloseTimeoutRef.current = null;
  };
  const scheduleHelpClose = () => {
    clearHelpCloseTimeout();
    helpCloseTimeoutRef.current = window.setTimeout(() => {
      helpCloseTimeoutRef.current = null;
      const activeElement = document.activeElement;
      if (!controlRef.current?.contains(activeElement) && !helpRef.current?.contains(activeElement))
        setHelpOpen(false);
    }, 300);
  };
  const dismissHelp = () => {
    clearHelpCloseTimeout();
    setHelpOpen(false);
    suppressPointerHelpRef.current = true;
    if (document.activeElement !== buttonRef.current) {
      suppressNextFocusHelpRef.current = true;
      buttonRef.current?.focus();
    }
  };

  useLayoutEffect(() => {
    if (!helpOpen) return;
    const placeHelp = () => {
      const anchor = controlRef.current?.getBoundingClientRect();
      const help = helpRef.current;
      if (!anchor || !help) return;
      const width = Math.min(help.getBoundingClientRect().width || 360, window.innerWidth - 24);
      const height = help.getBoundingClientRect().height;
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, anchor.left));
      const below = anchor.bottom;
      const top =
        below + height <= window.innerHeight - 12 ? below : Math.max(12, anchor.top - height);
      setHelpPosition((current) =>
        current.left === left && current.top === top ? current : { left, top },
      );
    };
    placeHelp();
    window.addEventListener("resize", placeHelp);
    window.addEventListener("scroll", placeHelp, true);
    return () => {
      window.removeEventListener("resize", placeHelp);
      window.removeEventListener("scroll", placeHelp, true);
      if (helpCloseTimeoutRef.current !== null) {
        window.clearTimeout(helpCloseTimeoutRef.current);
        helpCloseTimeoutRef.current = null;
      }
    };
  }, [helpOpen]);

  return (
    <span
      ref={controlRef}
      className="piano-roll-selection-action"
      onMouseEnter={() => {
        clearHelpCloseTimeout();
        if (!suppressPointerHelpRef.current) setHelpOpen(true);
      }}
      onMouseLeave={(event) => {
        suppressPointerHelpRef.current = false;
        if (
          !event.currentTarget.contains(document.activeElement) &&
          !helpRef.current?.contains(event.relatedTarget as Node | null)
        )
          scheduleHelpClose();
      }}
      onFocusCapture={() => {
        if (suppressNextFocusHelpRef.current) {
          suppressNextFocusHelpRef.current = false;
          return;
        }
        setHelpOpen(true);
      }}
      onBlurCapture={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget as Node | null) &&
          !helpRef.current?.contains(event.relatedTarget as Node | null)
        )
          setHelpOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !helpOpen) return;
        event.preventDefault();
        event.stopPropagation();
        dismissHelp();
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="piano-roll-selection-action-button"
        data-testid={testId}
        aria-label={accessibleName}
        aria-describedby={helpOpen ? helpId : undefined}
        title={title}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        {children}
      </button>
      {helpOpen && typeof document !== "undefined"
        ? createPortal(
            <aside
              ref={helpRef}
              className="piano-roll-selection-help"
              id={helpId}
              data-testid="piano-roll-selection-help"
              role="note"
              aria-label={`Piano Roll selection help for ${accessibleName}`}
              style={helpPosition}
              onMouseEnter={clearHelpCloseTimeout}
              onMouseLeave={(event) => {
                if (
                  !controlRef.current?.contains(event.relatedTarget as Node | null) &&
                  !controlRef.current?.contains(document.activeElement)
                )
                  scheduleHelpClose();
              }}
            >
              <span>
                <strong>{accessibleName}</strong>. This selects effective Melody notes only in that
                target. It leaves the Ctrl/Cmd+A scope ({selectionScopeLabel}), selection history,
                MIDI cursor and playback unchanged. Shift-click adds notes; drag empty grid to
                box-select. Arrows move selected notes; Alt or Shift+←/→ moves them in time.
                Ctrl/Cmd+C copies, X cuts, V pastes and D duplicates. Delete removes; Enter/Space
                auditions.
              </span>
              <button
                type="button"
                aria-label="Dismiss Piano Roll selection help"
                onClick={(event) => {
                  event.stopPropagation();
                  dismissHelp();
                }}
              >
                Close
              </button>
            </aside>,
            document.body,
          )
        : null}
    </span>
  );
}
