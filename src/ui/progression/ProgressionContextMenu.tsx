import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import type { PianoArticulation, ProgressionStep } from "../../domain/progression/step";
import type { MelodyGrid, MelodyPitchMotion } from "../../domain/melody/types";
import type { MeasuresPerSystem } from "../../domain/project/project";
import { MELODY_GRID_LABELS } from "../melody/labels";
import { MELODY_CONTOUR_GROUPS } from "../staff/ScoreSystemContextMenu";

export interface ProgressionContextMenuPosition {
  readonly x: number;
  readonly y: number;
}

export interface ProgressionContextMenuProps {
  readonly position: ProgressionContextMenuPosition;
  readonly invoker?: HTMLElement | undefined;
  readonly measureCount: number;
  readonly stepCount: number;
  readonly chordStepCount: number;
  readonly isLooping?: boolean | undefined;
  readonly hasMutedSystems?: boolean | undefined;
  readonly hasSoloSystems?: boolean | undefined;
  readonly canShiftOctaveUp?: boolean | undefined;
  readonly canShiftOctaveDown?: boolean | undefined;
  readonly currentArticulation?: PianoArticulation | undefined;
  readonly currentPitchMotion?: MelodyPitchMotion | undefined;
  readonly currentGrid?: MelodyGrid | undefined;
  readonly hasMelody?: boolean | undefined;
  readonly measuresPerSystem?: MeasuresPerSystem | "auto" | undefined;
  readonly steps?: readonly ProgressionStep[] | undefined;
  readonly onStartBranch?: ((originStepId?: string) => void) | undefined;
  readonly isBranchActive?: boolean | undefined;
  readonly onCommitBranch?: (() => void) | undefined;
  readonly onDiscardBranch?: (() => void) | undefined;
  readonly onPlayFromBeginning?: (() => void) | undefined;
  readonly onToggleLoop?: (() => void) | undefined;
  readonly onUnmuteAll?: (() => void) | undefined;
  readonly onClearSolos?: (() => void) | undefined;
  readonly onOctaveUp?: (() => void) | undefined;
  readonly onOctaveDown?: (() => void) | undefined;
  readonly onResetPerformance?: (() => void) | undefined;
  readonly onSetArticulation?: ((articulation: PianoArticulation) => void) | undefined;
  readonly onApplyMelodyContour?: ((motion: MelodyPitchMotion) => void) | undefined;
  readonly onSetMelodyGrid?: ((grid: MelodyGrid) => void) | undefined;
  readonly onClearMelody?: (() => void) | undefined;
  readonly onSetMeasuresPerSystem?: ((measures: MeasuresPerSystem | "auto") => void) | undefined;
  readonly onDuplicateAllSteps?: (() => void) | undefined;
  readonly onAddRest?: (() => void) | undefined;
  readonly onClearAllSteps?: (() => void) | undefined;
  readonly onClose: () => void;
}

const ARTICULATIONS: ReadonlyArray<{ id: PianoArticulation; label: string }> = [
  { id: "humanized", label: "Humanized" },
  { id: "block", label: "Block Chords" },
  { id: "arp-up", label: "Arpeggiate Up" },
  { id: "arp-down", label: "Arpeggiate Down" },
  { id: "broken-chord", label: "Broken Chord" },
];

const MELODY_GRIDS: ReadonlyArray<MelodyGrid> = [
  "quarter",
  "eighth",
  "sixteenth",
  "eighth-triplet",
  "sixteenth-triplet",
];

const MEASURES_PER_SYSTEM_OPTIONS: ReadonlyArray<{
  id: MeasuresPerSystem | "auto";
  label: string;
}> = [
  { id: "auto", label: "Auto (Responsive)" },
  { id: 4, label: "4 Measures / System" },
  { id: 3, label: "3 Measures / System" },
  { id: 2, label: "2 Measures / System" },
  { id: 1, label: "1 Measure / System (Full)" },
];

export function ProgressionContextMenu({
  position,
  invoker,
  measureCount,
  stepCount,
  chordStepCount,
  isLooping = false,
  hasMutedSystems = false,
  hasSoloSystems = false,
  canShiftOctaveUp = true,
  canShiftOctaveDown = true,
  currentArticulation,
  currentPitchMotion,
  currentGrid,
  hasMelody = false,
  measuresPerSystem,
  steps,
  onStartBranch,
  isBranchActive = false,
  onCommitBranch,
  onDiscardBranch,
  onPlayFromBeginning,
  onToggleLoop,
  onUnmuteAll,
  onClearSolos,
  onOctaveUp,
  onOctaveDown,
  onResetPerformance,
  onSetArticulation,
  onApplyMelodyContour,
  onSetMelodyGrid,
  onClearMelody,
  onSetMeasuresPerSystem,
  onDuplicateAllSteps,
  onAddRest,
  onClearAllSteps,
  onClose,
}: ProgressionContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [activeSubmenu, setActiveSubmenu] = useState<
    "articulation" | "melody" | "grid" | "layout" | "explore-alternative" | null
  >(null);
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
      invoker?.focus();
    };
  }, [invoker, onClose, activeSubmenu]);

  useEffect(() => {
    if (activeSubmenu && submenuRef.current) {
      const firstBtn = submenuRef.current.querySelector<HTMLButtonElement>("button:not(:disabled)");
      firstBtn?.focus();
    }
  }, [activeSubmenu]);

  const handleSubmenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!submenuRef.current) return;
    const items = Array.from(
      submenuRef.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      const next = items[(currentIndex + 1) % items.length];
      next?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const prev = items[(currentIndex - 1 + items.length) % items.length];
      prev?.focus();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      const currentSubmenu = activeSubmenu;
      setActiveSubmenu(null);
      const triggerBtn = itemRefs.current.find(
        (btn) => btn?.getAttribute("data-has-submenu") === currentSubmenu,
      );
      triggerBtn?.focus();
    }
  };

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
    const currentIndex = Math.max(
      0,
      enabledItems.indexOf(document.activeElement as HTMLButtonElement),
    );
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
        if (
          trigger === "articulation" ||
          trigger === "melody" ||
          trigger === "grid" ||
          trigger === "layout" ||
          trigger === "explore-alternative"
        ) {
          event.preventDefault();
          event.stopPropagation();
          const rect = (document.activeElement as HTMLElement).getBoundingClientRect();
          setSubmenuTop(rect.top);
          setActiveSubmenu(
            trigger as "articulation" | "melody" | "grid" | "layout" | "explore-alternative",
          );
        }
        break;
      }
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

  const registerRef = (index: number) => (el: HTMLButtonElement | null) => {
    itemRefs.current[index] = el;
  };

  const submenuWidth = 220;
  const menuWidth = menuRef.current?.getBoundingClientRect().width ?? 220;
  const spaceOnRight =
    typeof window !== "undefined"
      ? window.innerWidth - (adjustedPosition.x + menuWidth)
      : 800;
  const submenuX =
    spaceOnRight >= submenuWidth + 10
      ? adjustedPosition.x + menuWidth - 2
      : Math.max(8, adjustedPosition.x - submenuWidth + 2);

  let btnIndex = 0;

  return createPortal(
    <>
      <div
        ref={menuRef}
        className="melody-context-menu score-system-context-menu progression-context-menu"
        role="menu"
        aria-label="My Progression actions"
        tabIndex={-1}
        onKeyDownCapture={handleKeyDown}
        style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
        data-testid="progression-context-menu"
      >
        <div className="progression-menu-header" role="presentation">
          <span className="progression-menu-title">My Progression</span>
          <span className="progression-menu-subtitle">
            {stepCount === 0
              ? "Empty progression"
              : `${measureCount} measure${measureCount === 1 ? "" : "s"} · ${stepCount} step${stepCount === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="score-system-menu-separator" role="separator" />

        {/* 1. Playback & State */}
        {onPlayFromBeginning ? (
          <button
            ref={registerRef(btnIndex++)}
            type="button"
            role="menuitem"
            data-testid="progression-menu-play-beginning"
            onClick={() => {
              onPlayFromBeginning();
              onClose();
            }}
          >
            Play from Beginning
          </button>
        ) : null}

        {onToggleLoop ? (
          <button
            ref={registerRef(btnIndex++)}
            type="button"
            role="menuitem"
            data-testid="progression-menu-toggle-loop"
            onClick={() => {
              onToggleLoop();
              onClose();
            }}
          >
            <span className="score-system-menu-item-row">
              <span>Loop Progression</span>
              {isLooping ? <span className="score-system-menu-check">✓</span> : null}
            </span>
          </button>
        ) : null}

        {hasMutedSystems && onUnmuteAll ? (
          <button
            ref={registerRef(btnIndex++)}
            type="button"
            role="menuitem"
            data-testid="progression-menu-unmute-all"
            onClick={() => {
              onUnmuteAll();
              onClose();
            }}
          >
            Unmute All Systems
          </button>
        ) : null}

        {hasSoloSystems && onClearSolos ? (
          <button
            ref={registerRef(btnIndex++)}
            type="button"
            role="menuitem"
            data-testid="progression-menu-clear-solos"
            onClick={() => {
              onClearSolos();
              onClose();
            }}
          >
            Clear All Solos
          </button>
        ) : null}

        <div className="score-system-menu-separator" role="separator" />

        {/* 2. Pitch & Voicing (All Steps) */}
        {onOctaveUp ? (
          <button
            ref={registerRef(btnIndex++)}
            type="button"
            role="menuitem"
            disabled={!canShiftOctaveUp || chordStepCount === 0}
            data-testid="progression-menu-octave-up"
            onClick={() => {
              onOctaveUp();
              onClose();
            }}
          >
            Octave Up All (+1 8va)
          </button>
        ) : null}

        {onOctaveDown ? (
          <button
            ref={registerRef(btnIndex++)}
            type="button"
            role="menuitem"
            disabled={!canShiftOctaveDown || chordStepCount === 0}
            data-testid="progression-menu-octave-down"
            onClick={() => {
              onOctaveDown();
              onClose();
            }}
          >
            Octave Down All (-1 8vb)
          </button>
        ) : null}

        {onResetPerformance ? (
          <button
            ref={registerRef(btnIndex++)}
            type="button"
            role="menuitem"
            disabled={chordStepCount === 0}
            data-testid="progression-menu-reset-performance"
            onClick={() => {
              onResetPerformance();
              onClose();
            }}
          >
            Reset All Performance & Voicings
          </button>
        ) : null}

        {onSetArticulation ? (
          <button
            ref={registerRef(btnIndex++)}
            type="button"
            role="menuitem"
            disabled={chordStepCount === 0}
            data-has-submenu="articulation"
            data-testid="progression-menu-open-articulation"
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
              <span>Set Articulation for All</span>
              <span className="score-system-submenu-arrow">▸</span>
            </span>
          </button>
        ) : null}

        <div className="score-system-menu-separator" role="separator" />

        {/* 3. Melody Layer (All Steps) */}
        {onApplyMelodyContour ? (
          <button
            ref={registerRef(btnIndex++)}
            type="button"
            role="menuitem"
            disabled={chordStepCount === 0}
            data-has-submenu="melody"
            data-testid="progression-menu-open-melody"
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
              <span>Apply Melody Contour to All</span>
              <span className="score-system-submenu-arrow">▸</span>
            </span>
          </button>
        ) : null}

        {onSetMelodyGrid ? (
          <button
            ref={registerRef(btnIndex++)}
            type="button"
            role="menuitem"
            disabled={chordStepCount === 0}
            data-has-submenu="grid"
            data-testid="progression-menu-open-grid"
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setSubmenuTop(rect.top);
              setActiveSubmenu("grid");
            }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setSubmenuTop(rect.top);
              setActiveSubmenu((prev) => (prev === "grid" ? null : "grid"));
            }}
          >
            <span className="score-system-menu-item-row">
              <span>Set Melody Grid for All</span>
              <span className="score-system-submenu-arrow">▸</span>
            </span>
          </button>
        ) : null}

        {onClearMelody ? (
          <button
            ref={registerRef(btnIndex++)}
            type="button"
            role="menuitem"
            disabled={!hasMelody}
            data-testid="progression-menu-clear-melody"
            onClick={() => {
              onClearMelody();
              onClose();
            }}
          >
            Clear All Melodies
          </button>
        ) : null}

        <div className="score-system-menu-separator" role="separator" />

        {/* 4. Arrangement & Layout */}
        {measuresPerSystem !== undefined && onSetMeasuresPerSystem ? (
          <button
            ref={registerRef(btnIndex++)}
            type="button"
            role="menuitem"
            data-has-submenu="layout"
            data-testid="progression-menu-open-layout"
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setSubmenuTop(rect.top);
              setActiveSubmenu("layout");
            }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setSubmenuTop(rect.top);
              setActiveSubmenu((prev) => (prev === "layout" ? null : "layout"));
            }}
          >
            <span className="score-system-menu-item-row">
              <span>Measures / System</span>
              <span className="score-system-submenu-arrow">▸</span>
            </span>
          </button>
        ) : null}

        {onDuplicateAllSteps ? (
          <button
            ref={registerRef(btnIndex++)}
            type="button"
            role="menuitem"
            disabled={stepCount === 0}
            data-testid="progression-menu-duplicate-all"
            onClick={() => {
              onDuplicateAllSteps();
              onClose();
            }}
          >
            Duplicate All Steps
          </button>
        ) : null}

        {onAddRest ? (
          <button
            ref={registerRef(btnIndex++)}
            type="button"
            role="menuitem"
            data-testid="progression-menu-add-rest"
            onClick={() => {
              onAddRest();
              onClose();
            }}
          >
            Add Rest at End
          </button>
        ) : null}

        {isBranchActive ? (
          <>
            {onCommitBranch ? (
              <button
                ref={registerRef(btnIndex++)}
                type="button"
                role="menuitem"
                data-testid="progression-menu-commit-branch"
                onClick={() => {
                  onCommitBranch();
                  onClose();
                }}
              >
                Commit Active Branch
              </button>
            ) : null}
            {onDiscardBranch ? (
              <button
                ref={registerRef(btnIndex++)}
                type="button"
                role="menuitem"
                className="danger"
                data-testid="progression-menu-discard-branch"
                onClick={() => {
                  onDiscardBranch();
                  onClose();
                }}
              >
                Discard Active Branch
              </button>
            ) : null}
          </>
        ) : onStartBranch ? (
          <button
            ref={registerRef(btnIndex++)}
            type="button"
            role="menuitem"
            data-has-submenu="explore-alternative"
            data-testid="progression-menu-open-explore-alternative"
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setSubmenuTop(rect.top);
              setActiveSubmenu("explore-alternative");
            }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setSubmenuTop(rect.top);
              setActiveSubmenu((prev) =>
                prev === "explore-alternative" ? null : "explore-alternative",
              );
            }}
          >
            <span className="score-system-menu-item-row">
              <span>Explore Alternative</span>
              <span className="score-system-submenu-arrow">▸</span>
            </span>
          </button>
        ) : null}

        {/* 5. Clear All */}
        {onClearAllSteps ? (
          <>
            <div className="score-system-menu-separator" role="separator" />
            <button
              ref={registerRef(btnIndex++)}
              type="button"
              role="menuitem"
              disabled={stepCount === 0}
              className="danger"
              data-testid="progression-menu-clear-all"
              onClick={() => {
                onClearAllSteps();
                onClose();
              }}
            >
              Clear All Steps
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
          aria-label="Articulation styles for all steps"
          onKeyDownCapture={handleSubmenuKeyDown}
          style={{
            left: submenuX,
            top: Math.max(
              8,
              Math.min(
                submenuTop,
                (typeof window !== "undefined" ? window.innerHeight : 800) - 190,
              ),
            ),
          }}
          data-testid="progression-menu-articulation-submenu"
        >
          {ARTICULATIONS.map((art) => (
            <button
              key={art.id}
              type="button"
              role="menuitem"
              data-testid={`progression-menu-articulation-${art.id}`}
              onClick={() => {
                onSetArticulation(art.id);
                setActiveSubmenu(null);
                onClose();
              }}
            >
              <span className="score-system-menu-item-row">
                <span>{art.label}</span>
                {currentArticulation === art.id ? (
                  <span className="score-system-menu-check">✓</span>
                ) : null}
              </span>
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
          aria-label="Melody contours for all steps"
          onKeyDownCapture={handleSubmenuKeyDown}
          style={{
            left: submenuX,
            top: Math.max(
              8,
              Math.min(
                submenuTop,
                (typeof window !== "undefined" ? window.innerHeight : 800) - 340,
              ),
            ),
          }}
          data-testid="progression-menu-melody-submenu"
        >
          {MELODY_CONTOUR_GROUPS.map((group, groupIdx) => (
            <Fragment key={group.id}>
              {groupIdx > 0 ? (
                <div className="score-system-menu-separator" role="separator" />
              ) : null}
              <div className="score-system-menu-group-header" role="presentation">
                {group.label}
              </div>
              {group.items.map((contour) => (
                <button
                  key={contour.id}
                  type="button"
                  role="menuitem"
                  data-testid={`progression-menu-melody-${contour.id}`}
                  onClick={() => {
                    onApplyMelodyContour(contour.id);
                    setActiveSubmenu(null);
                    onClose();
                  }}
                >
                  <span className="score-system-menu-item-row">
                    <span>{contour.label}</span>
                    {currentPitchMotion === contour.id ? (
                      <span className="score-system-menu-check">✓</span>
                    ) : null}
                  </span>
                </button>
              ))}
            </Fragment>
          ))}
        </div>
      ) : null}

      {/* Submenu for Melody Grid */}
      {activeSubmenu === "grid" && onSetMelodyGrid ? (
        <div
          ref={submenuRef}
          className="melody-context-menu score-system-submenu"
          role="menu"
          aria-label="Melody grids for all steps"
          onKeyDownCapture={handleSubmenuKeyDown}
          style={{
            left: submenuX,
            top: Math.max(
              8,
              Math.min(
                submenuTop,
                (typeof window !== "undefined" ? window.innerHeight : 800) - 180,
              ),
            ),
          }}
          data-testid="progression-menu-grid-submenu"
        >
          {MELODY_GRIDS.map((grid) => (
            <button
              key={grid}
              type="button"
              role="menuitem"
              data-testid={`progression-menu-grid-${grid}`}
              onClick={() => {
                onSetMelodyGrid(grid);
                setActiveSubmenu(null);
                onClose();
              }}
            >
              <span className="score-system-menu-item-row">
                <span>{MELODY_GRID_LABELS[grid]}</span>
                {currentGrid === grid ? <span className="score-system-menu-check">✓</span> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Submenu for Layout (Measures / System) */}
      {activeSubmenu === "layout" && onSetMeasuresPerSystem ? (
        <div
          ref={submenuRef}
          className="melody-context-menu score-system-submenu"
          role="menu"
          aria-label="Measures per system layout"
          onKeyDownCapture={handleSubmenuKeyDown}
          style={{
            left: submenuX,
            top: Math.max(
              8,
              Math.min(
                submenuTop,
                (typeof window !== "undefined" ? window.innerHeight : 800) - 180,
              ),
            ),
          }}
          data-testid="progression-menu-layout-submenu"
        >
          {MEASURES_PER_SYSTEM_OPTIONS.map((opt) => (
            <button
              key={String(opt.id)}
              type="button"
              role="menuitem"
              data-testid={`progression-menu-layout-${opt.id}`}
              onClick={() => {
                onSetMeasuresPerSystem(opt.id);
                setActiveSubmenu(null);
                onClose();
              }}
            >
              <span className="score-system-menu-item-row">
                <span>{opt.label}</span>
                {measuresPerSystem === opt.id ? (
                  <span className="score-system-menu-check">✓</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Submenu for Explore Alternative */}
      {activeSubmenu === "explore-alternative" && onStartBranch ? (
        <div
          ref={submenuRef}
          className="melody-context-menu score-system-submenu"
          role="menu"
          aria-label="Explore Alternative options"
          onKeyDownCapture={handleSubmenuKeyDown}
          style={{
            left: submenuX,
            top: Math.max(
              8,
              Math.min(
                submenuTop,
                (typeof window !== "undefined" ? window.innerHeight : 800) - 280,
              ),
            ),
          }}
          data-testid="progression-menu-explore-alternative-submenu"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="progression-menu-branch-end"
            onClick={() => {
              onStartBranch(undefined);
              setActiveSubmenu(null);
              onClose();
            }}
          >
            At Progression End
          </button>
          {steps && steps.length > 0 ? (
            <>
              <div className="score-system-menu-separator" role="separator" />
              <div className="score-system-menu-group-header" role="presentation">
                Branch After Step
              </div>
              {steps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  role="menuitem"
                  data-testid={`progression-menu-branch-step-${index}`}
                  onClick={() => {
                    onStartBranch(step.id);
                    setActiveSubmenu(null);
                    onClose();
                  }}
                >
                  After {index + 1}: {step.kind === "chord" ? step.harmonicFunction.functionId : "Rest"}
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </>,
    document.body,
  );
}
