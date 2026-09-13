import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import type { ScoreSystem } from "../../notation/scoreSystemProjection";
import type { PianoArticulation } from "../../domain/progression/step";
import type { ChordMelodyRecipe } from "../../domain/melody/types";

export interface ScoreSystemMenuPosition {
  readonly x: number;
  readonly y: number;
}

export interface ScoreSystemContextMenuProps {
  readonly system: ScoreSystem;
  readonly position: ScoreSystemMenuPosition;
  readonly invoker: HTMLElement;
  readonly isLooping?: boolean | undefined;
  readonly isMuted?: boolean | undefined;
  readonly isSolo?: boolean | undefined;
  readonly canMoveUp?: boolean | undefined;
  readonly canMoveDown?: boolean | undefined;
  readonly canPaste?: boolean | undefined;
  readonly canShiftOctaveUp?: boolean | undefined;
  readonly canShiftOctaveDown?: boolean | undefined;
  readonly hasMelody?: boolean | undefined;
  readonly onPlayFromHere?: (() => void) | undefined;
  readonly onToggleLoop?: (() => void) | undefined;
  readonly onToggleMute?: (() => void) | undefined;
  readonly onToggleSolo?: (() => void) | undefined;
  readonly onMoveUp?: (() => void) | undefined;
  readonly onMoveDown?: (() => void) | undefined;
  readonly onDuplicate: () => void;
  readonly onCopy?: (() => void) | undefined;
  readonly onPasteAfter?: (() => void) | undefined;
  readonly onInsertEmptyAfter?: (() => void) | undefined;
  readonly onOctaveUp?: (() => void) | undefined;
  readonly onOctaveDown?: (() => void) | undefined;
  readonly onResetPerformance?: (() => void) | undefined;
  readonly onSetArticulation?: ((articulation: PianoArticulation) => void) | undefined;
  readonly onApplyMelodyContour?: ((recipe: ChordMelodyRecipe) => void) | undefined;
  readonly onClearMelody?: (() => void) | undefined;
  readonly onDelete?: (() => void) | undefined;
  readonly onClose: () => void;
}

const ARTICULATIONS: ReadonlyArray<{ id: PianoArticulation; label: string }> = [
  { id: "humanized", label: "Humanized" },
  { id: "block", label: "Block Chords" },
  { id: "arp-up", label: "Arpeggiate Up" },
  { id: "arp-down", label: "Arpeggiate Down" },
  { id: "broken-chord", label: "Broken Chord" },
];

const MELODY_CONTOURS: ReadonlyArray<{ id: string; label: string; recipe: ChordMelodyRecipe }> = [
  { id: "up-8th", label: "Ascending (1/8)", recipe: { pattern: "up", grid: "eighth", octaveOffset: 0 } },
  { id: "down-8th", label: "Descending (1/8)", recipe: { pattern: "down", grid: "eighth", octaveOffset: 0 } },
  { id: "wave-8th", label: "Up & Down (1/8)", recipe: { pattern: "up-down", grid: "eighth", octaveOffset: 0 } },
  { id: "inside-out-16th", label: "Inside-Out (1/16)", recipe: { pattern: "inside-out", grid: "sixteenth", octaveOffset: 0 } },
];

export function ScoreSystemContextMenu({
  system,
  position,
  invoker,
  isLooping = false,
  isMuted = false,
  isSolo = false,
  canMoveUp = true,
  canMoveDown = true,
  canPaste = false,
  canShiftOctaveUp = true,
  canShiftOctaveDown = true,
  hasMelody = false,
  onPlayFromHere,
  onToggleLoop,
  onToggleMute,
  onToggleSolo,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onCopy,
  onPasteAfter,
  onInsertEmptyAfter,
  onOctaveUp,
  onOctaveDown,
  onResetPerformance,
  onSetArticulation,
  onApplyMelodyContour,
  onClearMelody,
  onDelete,
  onClose,
}: ScoreSystemContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [activeSubmenu, setActiveSubmenu] = useState<"articulation" | "melody" | null>(null);
  const [submenuTop, setSubmenuTop] = useState(0);

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
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target) &&
        !submenuRef.current?.contains(event.target)
      ) {
        onClose();
      }
    };
    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (activeSubmenu) {
          setActiveSubmenu(null);
        } else {
          onClose();
        }
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
  }, [invoker, onClose, activeSubmenu]);

  const focusItem = (index: number) => {
    const enabledItems = itemRefs.current.filter(
      (item): item is HTMLButtonElement => item !== null && !item.disabled,
    );
    if (!enabledItems.length) return;
    enabledItems[(index + enabledItems.length) % enabledItems.length]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabledItems = itemRefs.current.filter(
      (item): item is HTMLButtonElement => item !== null && !item.disabled,
    );
    const currentIndex = Math.max(0, enabledItems.indexOf(document.activeElement as HTMLButtonElement));
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
        focusItem(enabledItems.length - 1);
        break;
      case "ArrowRight": {
        if (activeSubmenu) return;
        const trigger = (document.activeElement as HTMLElement)?.getAttribute("data-has-submenu");
        if (trigger === "articulation" || trigger === "melody") {
          event.preventDefault();
          event.stopPropagation();
          const rect = (document.activeElement as HTMLElement).getBoundingClientRect();
          setSubmenuTop(rect.top);
          setActiveSubmenu(trigger);
        }
        break;
      }
      case "ArrowLeft": {
        if (activeSubmenu) {
          event.preventDefault();
          event.stopPropagation();
          setActiveSubmenu(null);
        }
        break;
      }
      case "Enter":
      case " ":
        event.preventDefault();
        event.stopPropagation();
        if (document.activeElement instanceof HTMLButtonElement) document.activeElement.click();
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        if (activeSubmenu) {
          setActiveSubmenu(null);
        } else {
          onClose();
        }
        break;
    }
  };

  const registerRef = (index: number) => (node: HTMLButtonElement | null) => {
    itemRefs.current[index] = node;
  };

  const menuWidth = menuRef.current?.getBoundingClientRect().width ?? 220;
  const submenuX =
    adjustedPosition.x + menuWidth + 210 < window.innerWidth
      ? adjustedPosition.x + menuWidth + 2
      : Math.max(8, adjustedPosition.x - 200);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
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
      {/* 1. Playback & Rehearsal */}
      {onPlayFromHere ? (
        <button
          ref={registerRef(0)}
          type="button"
          role="menuitem"
          data-testid="score-system-play-from-here"
          onClick={() => {
            onPlayFromHere();
            onClose();
          }}
        >
          <span className="score-system-menu-item-row">
            <span>Play from this System</span>
            <span style={{ fontSize: 11, opacity: 0.7 }}>▶</span>
          </span>
        </button>
      ) : null}

      {onToggleLoop ? (
        <button
          ref={registerRef(1)}
          type="button"
          role="menuitem"
          data-testid="score-system-toggle-loop"
          onClick={() => {
            onToggleLoop();
            onClose();
          }}
        >
          <span className="score-system-menu-item-row">
            <span>Loop System</span>
            {isLooping ? <span className="score-system-menu-check">✓</span> : null}
          </span>
        </button>
      ) : null}

      {onToggleMute ? (
        <button
          ref={registerRef(2)}
          type="button"
          role="menuitem"
          data-testid="score-system-toggle-mute"
          onClick={() => {
            onToggleMute();
            onClose();
          }}
        >
          <span className="score-system-menu-item-row">
            <span>{isMuted ? "Unmute System" : "Mute System"}</span>
            {isMuted ? <span className="score-system-menu-check">✓</span> : null}
          </span>
        </button>
      ) : null}

      {onToggleSolo ? (
        <button
          ref={registerRef(3)}
          type="button"
          role="menuitem"
          data-testid="score-system-toggle-solo"
          onClick={() => {
            onToggleSolo();
            onClose();
          }}
        >
          <span className="score-system-menu-item-row">
            <span>{isSolo ? "Unsolo System" : "Solo System"}</span>
            {isSolo ? <span className="score-system-menu-check">✓</span> : null}
          </span>
        </button>
      ) : null}

      <div className="score-system-menu-separator" role="separator" />

      {/* 2. Structure & Arrangement */}
      {onMoveUp ? (
        <button
          ref={registerRef(4)}
          type="button"
          role="menuitem"
          disabled={!canMoveUp}
          data-testid="score-system-move-up"
          onClick={() => {
            onMoveUp();
            onClose();
          }}
        >
          Move System Up
        </button>
      ) : null}

      {onMoveDown ? (
        <button
          ref={registerRef(5)}
          type="button"
          role="menuitem"
          disabled={!canMoveDown}
          data-testid="score-system-move-down"
          onClick={() => {
            onMoveDown();
            onClose();
          }}
        >
          Move System Down
        </button>
      ) : null}

      <button
        ref={registerRef(6)}
        type="button"
        role="menuitem"
        data-testid="score-system-duplicate"
        onClick={() => {
          onDuplicate();
          onClose();
        }}
      >
        Duplicate System
      </button>

      {onCopy ? (
        <button
          ref={registerRef(7)}
          type="button"
          role="menuitem"
          data-testid="score-system-copy"
          onClick={() => {
            onCopy();
            onClose();
          }}
        >
          Copy System
        </button>
      ) : null}

      {onPasteAfter ? (
        <button
          ref={registerRef(8)}
          type="button"
          role="menuitem"
          disabled={!canPaste}
          data-testid="score-system-paste-after"
          onClick={() => {
            onPasteAfter();
            onClose();
          }}
        >
          Paste System After
        </button>
      ) : null}

      {onInsertEmptyAfter ? (
        <button
          ref={registerRef(9)}
          type="button"
          role="menuitem"
          data-testid="score-system-insert-empty-after"
          onClick={() => {
            onInsertEmptyAfter();
            onClose();
          }}
        >
          Insert Empty System After
        </button>
      ) : null}

      <div className="score-system-menu-separator" role="separator" />

      {/* 3. Pitch, Voicing & Articulation */}
      {onOctaveUp ? (
        <button
          ref={registerRef(10)}
          type="button"
          role="menuitem"
          disabled={!canShiftOctaveUp}
          data-testid="score-system-octave-up"
          onClick={() => {
            onOctaveUp();
            onClose();
          }}
        >
          Octave Up (+1 8va)
        </button>
      ) : null}

      {onOctaveDown ? (
        <button
          ref={registerRef(11)}
          type="button"
          role="menuitem"
          disabled={!canShiftOctaveDown}
          data-testid="score-system-octave-down"
          onClick={() => {
            onOctaveDown();
            onClose();
          }}
        >
          Octave Down (-1 8vb)
        </button>
      ) : null}

      {onResetPerformance ? (
        <button
          ref={registerRef(12)}
          type="button"
          role="menuitem"
          data-testid="score-system-reset-performance"
          onClick={() => {
            onResetPerformance();
            onClose();
          }}
        >
          Reset Performance & Voicings
        </button>
      ) : null}

      {onSetArticulation ? (
        <button
          ref={registerRef(13)}
          type="button"
          role="menuitem"
          data-has-submenu="articulation"
          data-testid="score-system-open-articulation"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setSubmenuTop(rect.top);
            setActiveSubmenu("articulation");
          }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setSubmenuTop(rect.top);
            setActiveSubmenu((prev) => (prev === "articulation" ? null : "articulation"));
          }}
        >
          <span className="score-system-menu-item-row">
            <span>Set Articulation</span>
            <span className="score-system-submenu-arrow">▸</span>
          </span>
        </button>
      ) : null}

      <div className="score-system-menu-separator" role="separator" />

      {/* 4. Melody Layer */}
      {onApplyMelodyContour ? (
        <button
          ref={registerRef(14)}
          type="button"
          role="menuitem"
          data-has-submenu="melody"
          data-testid="score-system-open-melody"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setSubmenuTop(rect.top);
            setActiveSubmenu("melody");
          }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setSubmenuTop(rect.top);
            setActiveSubmenu((prev) => (prev === "melody" ? null : "melody"));
          }}
        >
          <span className="score-system-menu-item-row">
            <span>Apply Melody Contour</span>
            <span className="score-system-submenu-arrow">▸</span>
          </span>
        </button>
      ) : null}

      {onClearMelody ? (
        <button
          ref={registerRef(15)}
          type="button"
          role="menuitem"
          disabled={!hasMelody}
          data-testid="score-system-clear-melody"
          onClick={() => {
            onClearMelody();
            onClose();
          }}
        >
          Clear Melody
        </button>
      ) : null}

      {/* 5. Destruction */}
      {onDelete ? (
        <>
          <div className="score-system-menu-separator" role="separator" />
          <button
            ref={registerRef(16)}
            type="button"
            role="menuitem"
            className="danger"
            data-testid="score-system-delete"
            onClick={() => {
              onDelete();
              onClose();
            }}
          >
            Delete System
          </button>
        </>
      ) : null}
      </div>

      {/* Submenu for Articulation */}
      {activeSubmenu === "articulation" && onSetArticulation ? (
        <div
          ref={submenuRef}
          className="melody-context-menu score-system-submenu"
          role="menu"
          aria-label="Articulation styles"
          style={{
            left: submenuX,
            top: Math.max(8, Math.min(submenuTop, (typeof window !== "undefined" ? window.innerHeight : 800) - 190)),
          }}
          data-testid="score-system-articulation-submenu"
        >
          {ARTICULATIONS.map((art) => (
            <button
              key={art.id}
              type="button"
              role="menuitem"
              data-testid={`score-system-articulation-${art.id}`}
              onClick={() => {
                onSetArticulation(art.id);
                setActiveSubmenu(null);
                onClose();
              }}
            >
              {art.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Submenu for Melody Contour */}
      {activeSubmenu === "melody" && onApplyMelodyContour ? (
        <div
          ref={submenuRef}
          className="melody-context-menu score-system-submenu"
          role="menu"
          aria-label="Melody contours"
          style={{
            left: submenuX,
            top: Math.max(8, Math.min(submenuTop, (typeof window !== "undefined" ? window.innerHeight : 800) - 160)),
          }}
          data-testid="score-system-melody-submenu"
        >
          {MELODY_CONTOURS.map((contour) => (
            <button
              key={contour.id}
              type="button"
              role="menuitem"
              data-testid={`score-system-melody-${contour.id}`}
              onClick={() => {
                onApplyMelodyContour(contour.recipe);
                setActiveSubmenu(null);
                onClose();
              }}
            >
              {contour.label}
            </button>
          ))}
        </div>
      ) : null}
    </>,
    document.body
  );
}

