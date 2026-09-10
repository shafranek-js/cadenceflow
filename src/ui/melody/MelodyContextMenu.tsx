import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { ChordStep } from "../../domain/progression/step";
import { formatChordSymbol } from "../../domain/harmony/chord";
import { realizeChord } from "../../domain/harmony/realization";
import type { PitchClassIdentity } from "../../domain/harmony/pitch";

export interface MelodyMenuPosition {
  readonly x: number;
  readonly y: number;
}

export interface MelodyContextMenuProps {
  readonly step: ChordStep;
  readonly position: MelodyMenuPosition;
  readonly invoker: HTMLElement;
  readonly tonic?: PitchClassIdentity;
  readonly onCreate: () => void;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
  readonly onClose: () => void;
}

function sourceLabel(step: ChordStep, tonic: PitchClassIdentity): string {
  return formatChordSymbol({
    ...realizeChord(step.harmonicFunction, tonic),
    variant: step.harmonicVariant,
  });
}

export function MelodyContextMenu({
  step,
  position,
  invoker,
  tonic = 0,
  onCreate,
  onEdit,
  onRemove,
  onClose,
}: MelodyContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const hasRecipe = step.melody !== undefined;

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

  const menuItems = hasRecipe
    ? [
        { label: "Edit Melody…", action: onEdit },
        { label: "Remove Melody", action: onRemove },
      ]
    : [{ label: "Create Melody…", action: onCreate }];

  return (
    <div
      ref={menuRef}
      className="melody-context-menu"
      role="menu"
      aria-label={`Melody actions for ${sourceLabel(step, tonic)}`}
      tabIndex={-1}
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
      onKeyDown={handleKeyDown}
      data-testid="melody-context-menu"
    >
      {menuItems.map((item, index) => (
        <button
          key={item.label}
          ref={(node) => {
            itemRefs.current[index] = node;
          }}
          type="button"
          role="menuitem"
          onClick={item.action}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export type MelodyContextMenuInvokerRef = RefObject<HTMLElement | null>;
