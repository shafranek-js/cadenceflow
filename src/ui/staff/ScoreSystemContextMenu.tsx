import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { ScoreSystem } from "../../notation/scoreSystemProjection";

export interface ScoreSystemMenuPosition {
  readonly x: number;
  readonly y: number;
}

export interface ScoreSystemContextMenuProps {
  readonly system: ScoreSystem;
  readonly position: ScoreSystemMenuPosition;
  readonly invoker: HTMLElement;
  readonly onDuplicate: () => void;
  readonly onDelete?: () => void;
  readonly onClose: () => void;
}

export function ScoreSystemContextMenu({
  system,
  position,
  invoker,
  onDuplicate,
  onDelete,
  onClose,
}: ScoreSystemContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const width = menu.getBoundingClientRect().width;
    const height = menu.getBoundingClientRect().height;
    const margin = 8;
    setAdjustedPosition({
      x: Math.max(margin, Math.min(position.x, window.innerWidth - width - margin)),
      y: Math.max(margin, Math.min(position.y, window.innerHeight - height - margin)),
    });
  }, [position]);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => itemRefs.current[0]?.focus());
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) onClose();
    };
    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      invoker.focus();
    };
  }, [invoker, onClose]);

  const focusItem = (index: number) => {
    const count = itemRefs.current.length;
    if (!count) return;
    itemRefs.current[(index + count) % count]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null);
    const currentIndex = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        event.stopPropagation();
        focusItem(currentIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        event.stopPropagation();
        focusItem(currentIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        event.stopPropagation();
        focusItem(0);
        break;
      case "End":
        event.preventDefault();
        event.stopPropagation();
        focusItem(items.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        event.stopPropagation();
        if (document.activeElement instanceof HTMLButtonElement) document.activeElement.click();
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        onClose();
        break;
    }
  };

  return (
    <div
      ref={menuRef}
      className="melody-context-menu score-system-context-menu"
      role="menu"
      aria-label={`Actions for System ${system.index + 1}`}
      tabIndex={-1}
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
      onKeyDownCapture={handleKeyDown}
      data-testid="score-system-context-menu"
    >
      <button
        ref={(node) => {
          itemRefs.current[0] = node;
        }}
        type="button"
        role="menuitem"
        onClick={() => {
          onDuplicate();
          onClose();
        }}
      >
        Duplicate System
      </button>
      {onDelete ? (
        <button
          ref={(node) => {
            itemRefs.current[1] = node;
          }}
          type="button"
          role="menuitem"
          className="danger"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          Delete System
        </button>
      ) : null}
    </div>
  );
}
