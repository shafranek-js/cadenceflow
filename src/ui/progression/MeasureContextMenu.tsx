import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export interface MeasureMenuPosition {
  readonly x: number;
  readonly y: number;
}

export interface MeasureContextMenuProps {
  readonly measureNumber: number;
  readonly position: MeasureMenuPosition;
  readonly invoker: HTMLElement;
  readonly deleteDisabledReason?: string | null;
  readonly insertDisabledReason?: string | null;
  readonly duplicateDisabledReason?: string | null;
  readonly loopDisabledReason?: string | null;
  readonly focusFallback?: (() => HTMLElement | null) | undefined;
  readonly onPlay?: (() => void) | undefined;
  readonly onLoop?: (() => void) | undefined;
  readonly onInsertAfter: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly onClose: () => void;
}

function sharedRefusalMessage(
  deleteReason: string | null | undefined,
  insertReason: string | null | undefined,
): string | undefined {
  const reasons = [deleteReason, insertReason].filter((reason): reason is string =>
    Boolean(reason),
  );
  if (reasons.length < 2) return undefined;
  if (reasons.every((reason) => reason === reasons[0])) return reasons[0];
  if (reasons.every((reason) => reason.includes("active branch")))
    return "Finish or discard the active branch before inserting, duplicating or deleting a Measure; its anchors refer to the current Steps.";
  const instrumentsRequired = (reason: string) =>
    /would need (.+?) (?:in one Step|inside Measure)/i.exec(reason)?.[1]?.trim();
  const requiredInstruments = reasons.map(instrumentsRequired);
  if (
    requiredInstruments[0] &&
    requiredInstruments.every((instruments) => instruments === requiredInstruments[0])
  )
    return reasons[0];
  return undefined;
}

export function MeasureContextMenu({
  measureNumber,
  position,
  invoker,
  deleteDisabledReason,
  insertDisabledReason,
  duplicateDisabledReason,
  loopDisabledReason,
  focusFallback,
  onPlay,
  onLoop,
  onInsertAfter,
  onDuplicate,
  onDelete,
  onClose,
}: MeasureContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sharedRefusal = sharedRefusalMessage(deleteDisabledReason, insertDisabledReason);
  const duplicateRefusalId =
    duplicateDisabledReason && duplicateDisabledReason === sharedRefusal
      ? "measure-context-menu-reason"
      : "measure-context-menu-duplicate-reason";

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const margin = 8;
    const rect = menu.getBoundingClientRect();
    const statusBarTop =
      document.querySelector<HTMLElement>(".app-status-bar")?.getBoundingClientRect().top ??
      window.innerHeight;
    const safeBottom = Math.min(window.innerHeight - margin, statusBarTop - margin);
    const adjusted = {
      x: Math.max(margin, Math.min(position.x, window.innerWidth - rect.width - margin)),
      y: Math.max(margin, Math.min(position.y, safeBottom - rect.height)),
    };
    menu.style.left = `${adjusted.x}px`;
    menu.style.top = `${adjusted.y}px`;
  }, [position]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const first = itemRefs.current.find((item) => item && !item.disabled);
      first?.focus();
    });
    const restoreFocus = () => {
      const target = invoker.isConnected ? invoker : focusFallback?.();
      target?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        onClose();
        window.setTimeout(restoreFocus, 0);
      }
    };
    const onDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
      restoreFocus();
    };
  }, [focusFallback, invoker, onClose]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null);
    const enabled = items.filter((item) => !item.disabled);
    const current = Math.max(0, enabled.indexOf(document.activeElement as HTMLButtonElement));
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      enabled[(current + direction + enabled.length) % enabled.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      (event.key === "Home" ? enabled[0] : enabled.at(-1))?.focus();
    }
  };

  const run = (action: () => void) => {
    action();
    onClose();
  };

  return createPortal(
    <div
      ref={menuRef}
      className="measure-context-menu"
      role="menu"
      aria-label={`Measure ${measureNumber} commands`}
      data-testid="measure-context-menu"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={handleKeyDown}
    >
      <div className="measure-context-menu-title">Measure {measureNumber}</div>
      {onPlay ? (
        <button
          ref={(node) => {
            itemRefs.current[0] = node;
          }}
          type="button"
          role="menuitem"
          onClick={() => run(onPlay)}
        >
          Play Measure {measureNumber}
        </button>
      ) : null}
      {onLoop ? (
        <button
          ref={(node) => {
            itemRefs.current[1] = node;
          }}
          type="button"
          role="menuitem"
          disabled={Boolean(loopDisabledReason)}
          aria-describedby={loopDisabledReason ? "measure-context-menu-loop-reason" : undefined}
          onClick={() => run(onLoop)}
        >
          Loop Measure {measureNumber}
        </button>
      ) : null}
      <button
        ref={(node) => {
          itemRefs.current[2] = node;
        }}
        type="button"
        role="menuitem"
        disabled={Boolean(insertDisabledReason)}
        aria-describedby={
          insertDisabledReason
            ? sharedRefusal || insertDisabledReason === deleteDisabledReason
              ? "measure-context-menu-reason"
              : "measure-context-menu-insert-reason"
            : undefined
        }
        onClick={() => {
          if (!insertDisabledReason) run(onInsertAfter);
        }}
      >
        Insert Measure After {measureNumber}
      </button>
      <button
        ref={(node) => {
          itemRefs.current[3] = node;
        }}
        type="button"
        role="menuitem"
        disabled={Boolean(duplicateDisabledReason)}
        aria-describedby={duplicateDisabledReason ? duplicateRefusalId : undefined}
        onClick={() => {
          if (!duplicateDisabledReason) run(onDuplicate);
        }}
      >
        Duplicate Measure {measureNumber} to End
      </button>
      <button
        ref={(node) => {
          itemRefs.current[4] = node;
        }}
        type="button"
        role="menuitem"
        disabled={Boolean(deleteDisabledReason)}
        aria-describedby={deleteDisabledReason ? "measure-context-menu-reason" : undefined}
        className="measure-context-menu-delete"
        onClick={() => {
          if (!deleteDisabledReason) run(onDelete);
        }}
      >
        Delete Measure {measureNumber}
      </button>
      <button
        ref={(node) => {
          itemRefs.current[5] = node;
        }}
        type="button"
        role="menuitem"
        onClick={onClose}
      >
        Close menu
      </button>
      {sharedRefusal ? (
        <p id="measure-context-menu-reason" className="measure-context-menu-reason" role="status">
          {sharedRefusal}
        </p>
      ) : (
        [
          { id: "measure-context-menu-reason", reason: deleteDisabledReason },
          { id: "measure-context-menu-insert-reason", reason: insertDisabledReason },
        ]
          .filter(
            (entry, index, all) =>
              entry.reason && all.findIndex((other) => other.reason === entry.reason) === index,
          )
          .map((entry) => (
            <p
              key={entry.id}
              id={entry.id}
              className={
                entry.id === "measure-context-menu-duplicate-reason"
                  ? "measure-context-menu-duplicate-reason"
                  : "measure-context-menu-reason"
              }
              role="status"
            >
              {entry.reason}
            </p>
          ))
      )}
      {duplicateDisabledReason && duplicateDisabledReason !== sharedRefusal ? (
        <p
          id="measure-context-menu-duplicate-reason"
          className="measure-context-menu-duplicate-reason"
          role="status"
        >
          {duplicateDisabledReason}
        </p>
      ) : null}
      {loopDisabledReason ? (
        <p
          id="measure-context-menu-loop-reason"
          className="measure-context-menu-reason"
          role="status"
        >
          {loopDisabledReason}
        </p>
      ) : null}
    </div>,
    document.body,
  );
}
