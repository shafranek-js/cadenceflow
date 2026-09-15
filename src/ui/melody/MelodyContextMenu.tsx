import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { ProgressionStep } from "../../domain/progression/step";
import { formatChordSymbol } from "../../domain/harmony/chord";
import { realizeChord } from "../../domain/harmony/realization";
import type { PitchClassIdentity } from "../../domain/harmony/pitch";
import type { ChordSubstitution } from "../../domain/harmony/reharmonization";

export interface MelodyMenuPosition {
  readonly x: number;
  readonly y: number;
}

export interface MelodyContextMenuProps {
  readonly step: ProgressionStep;
  readonly position: MelodyMenuPosition;
  readonly invoker: HTMLElement;
  readonly tonic?: PitchClassIdentity | undefined;
  readonly onCreate?: (() => void) | undefined;
  readonly onEdit?: (() => void) | undefined;
  readonly onRemove?: (() => void) | undefined;
  readonly onDuplicate?: (() => void) | undefined;
  readonly onInsertSelectedBefore?: (() => void) | null | undefined;
  readonly onInsertSelectedAfter?: (() => void) | null | undefined;
  readonly selectedMatrixChordName?: string | undefined;
  readonly substitutions?: readonly ChordSubstitution[] | undefined;
  readonly onApplySubstitution?: ((substitution: ChordSubstitution) => void) | undefined;
  readonly onOpenModulation?: (() => void) | undefined;
  readonly onDeleteStep?: (() => void) | undefined;
  readonly onClose: () => void;
}

function sourceLabel(step: ProgressionStep, tonic: PitchClassIdentity): string {
  if (step.kind === "rest") return "Rest";
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
  onDuplicate,
  onInsertSelectedBefore,
  onInsertSelectedAfter,
  selectedMatrixChordName,
  substitutions,
  onApplySubstitution,
  onOpenModulation,
  onDeleteStep,
  onClose,
}: MelodyContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const isChord = step.kind === "chord";
  const hasRecipe = isChord && step.melody !== undefined;

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
    const frameId = requestAnimationFrame(() => {
      const firstEnabled = itemRefs.current.find((btn) => btn && !btn.disabled);
      firstEnabled?.focus();
    });
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
    const items = itemRefs.current.filter((item): item is HTMLButtonElement => item !== null);
    if (!items.length) return;
    items[(index + items.length) % items.length]?.focus();
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
        if (document.activeElement instanceof HTMLButtonElement && !document.activeElement.disabled) {
          document.activeElement.click();
        }
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        onClose();
        break;
    }
  };

  const melodyItems: Array<{ label: string; action?: () => void }> = isChord
    ? hasRecipe
      ? [
          ...(onEdit ? [{ label: "Edit Melody…", action: onEdit }] : []),
          ...(onRemove ? [{ label: "Remove Melody", action: onRemove }] : []),
        ]
      : [...(onCreate ? [{ label: "Create Melody…", action: onCreate }] : [])]
    : [];

  const deleteLabel = isChord ? "Delete Chord" : "Delete Rest";
  const insertChordLabel = selectedMatrixChordName
    ? `${selectedMatrixChordName}`
    : "Selected Chord (None Selected)";

  let btnIndex = 0;

  return (
    <div
      ref={menuRef}
      className="melody-context-menu"
      role="menu"
      aria-label={`Melody actions for ${sourceLabel(step, tonic)}`}
      tabIndex={-1}
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
      onKeyDownCapture={handleKeyDown}
      data-testid="melody-context-menu"
    >
      {/* 1. Melody items */}
      {melodyItems.map((item) => {
        const index = btnIndex++;
        return (
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
        );
      })}

      {/* 2. Chord / Step Operations */}
      {isChord && onDuplicate ? (
        <>
          {melodyItems.length > 0 ? (
            <div className="melody-context-menu-separator" role="separator" />
          ) : null}
          <button
            ref={(node) => {
              itemRefs.current[btnIndex++] = node;
            }}
            type="button"
            role="menuitem"
            data-testid="step-menu-duplicate"
            onClick={onDuplicate}
          >
            Duplicate Chord
          </button>
        </>
      ) : null}

      {onInsertSelectedBefore !== undefined || onInsertSelectedAfter !== undefined ? (
        <>
          {melodyItems.length > 0 && !onDuplicate ? (
            <div className="melody-context-menu-separator" role="separator" />
          ) : null}
          <button
            ref={(node) => {
              itemRefs.current[btnIndex++] = node;
            }}
            type="button"
            role="menuitem"
            disabled={!onInsertSelectedBefore}
            data-testid="step-menu-insert-before"
            title={
              onInsertSelectedBefore
                ? undefined
                : "Select a chord in the Harmonic Matrix to insert"
            }
            onClick={onInsertSelectedBefore ?? undefined}
          >
            Insert {insertChordLabel} Before
          </button>
          <button
            ref={(node) => {
              itemRefs.current[btnIndex++] = node;
            }}
            type="button"
            role="menuitem"
            disabled={!onInsertSelectedAfter}
            data-testid="step-menu-insert-after"
            title={
              onInsertSelectedAfter
                ? undefined
                : "Select a chord in the Harmonic Matrix to insert"
            }
            onClick={onInsertSelectedAfter ?? undefined}
          >
            Insert {insertChordLabel} After
          </button>
        </>
      ) : null}

      {/* 3. Reharmonization Section */}
      {isChord && substitutions && substitutions.length > 0 && onApplySubstitution ? (
        <>
          <div className="melody-context-menu-separator" role="separator" />
          <div
            className="context-menu-subheading"
            role="presentation"
            style={{
              padding: "4px 8px",
              fontSize: "0.68rem",
              fontWeight: 700,
              textTransform: "uppercase",
              color: "var(--text-muted)",
              letterSpacing: "0.05em",
            }}
          >
            Reharmonize
          </div>
          {substitutions.slice(0, 4).map((sub) => (
            <button
              key={sub.id}
              ref={(node) => {
                itemRefs.current[btnIndex++] = node;
              }}
              type="button"
              role="menuitem"
              data-testid={`step-menu-reharmonize-${sub.id}`}
              onClick={() => {
                onApplySubstitution(sub);
                onClose();
              }}
            >
              {sub.operation === "replace" ? "Swap to" : "Insert"} {sub.chordSymbol} ({sub.title})
            </button>
          ))}
        </>
      ) : null}

      {/* 4. Modulation Action */}
      {onOpenModulation ? (
        <>
          <div className="melody-context-menu-separator" role="separator" />
          <button
            ref={(node) => {
              itemRefs.current[btnIndex++] = node;
            }}
            type="button"
            role="menuitem"
            data-testid="step-menu-modulate"
            onClick={() => {
              onClose();
              onOpenModulation();
            }}
          >
            🧭 Modulate from here...
          </button>
        </>
      ) : null}

      {/* 5. Delete Action */}
      {onDeleteStep ? (
        <>
          <div className="melody-context-menu-separator" role="separator" />
          <button
            ref={(node) => {
              itemRefs.current[btnIndex++] = node;
            }}
            type="button"
            role="menuitem"
            className="danger"
            data-testid="step-menu-delete"
            onClick={onDeleteStep}
          >
            {deleteLabel}
          </button>
        </>
      ) : null}
    </div>
  );
}

export type MelodyContextMenuInvokerRef = RefObject<HTMLElement | null>;
