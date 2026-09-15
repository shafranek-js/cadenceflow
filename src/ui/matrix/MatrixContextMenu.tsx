import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import type { HarmonicModuleId } from "../../domain/harmony/functions";
import { modeForModule } from "../../domain/harmony/functions";
import { defaultTonicSpelling, formatPitchSpelling } from "../../domain/harmony/spelling";
import type {
  CardViewId,
  PianoArticulation,
  RegisterOffset,
} from "../../domain/progression/step";

export interface MatrixContextMenuPosition {
  readonly x: number;
  readonly y: number;
}

export interface MatrixContextMenuProps {
  readonly position: MatrixContextMenuPosition;
  readonly invoker?: HTMLElement | undefined;
  readonly activeModule: HarmonicModuleId;
  readonly tonic: number;
  readonly globalView: CardViewId;
  readonly showBassInStaff: boolean;
  readonly suzukiColors?: boolean | undefined;
  readonly resolutionArrows?: boolean | undefined;
  readonly currentArticulation?: PianoArticulation | undefined;
  readonly currentRegister?: RegisterOffset | undefined;
  readonly hasPreviewSelection?: boolean | undefined;
  readonly isRecommendationsActive?: boolean | undefined;

  // Actions
  readonly onResetCurrentModule?: (() => void) | undefined;
  readonly onResetAllModules?: (() => void) | undefined;
  readonly onResetTemplateDefaults?: (() => void) | undefined;
  readonly onSetModule?: ((moduleId: HarmonicModuleId) => void) | undefined;
  readonly onTranspose?: ((semitones: number) => void) | undefined;
  readonly onSetTonic?: ((tonic: number) => void) | undefined;
  readonly onSetView?: ((view: CardViewId) => void) | undefined;
  readonly onToggleBassInStaff?: (() => void) | undefined;
  readonly onToggleSuzukiColors?: (() => void) | undefined;
  readonly onToggleResolutionArrows?: (() => void) | undefined;
  readonly onSetArticulation?: ((articulation: PianoArticulation) => void) | undefined;
  readonly onSetRegister?: ((register: RegisterOffset) => void) | undefined;
  readonly onToggleRecommendations?: (() => void) | undefined;
  readonly onClearSelection?: (() => void) | undefined;
  readonly onClose: () => void;
}

const ARTICULATIONS: ReadonlyArray<{ id: PianoArticulation; label: string }> = [
  { id: "humanized", label: "Humanized" },
  { id: "block", label: "Block Chords" },
  { id: "arp-up", label: "Arpeggiate Up" },
  { id: "arp-down", label: "Arpeggiate Down" },
  { id: "broken-chord", label: "Broken Chord" },
];

const REGISTERS: ReadonlyArray<{ id: RegisterOffset; label: string }> = [
  { id: "auto", label: "Auto" },
  { id: 2, label: "+2 Octaves" },
  { id: 1, label: "+1 Octave" },
  { id: 0, label: "Normal (0)" },
  { id: -1, label: "-1 Octave" },
  { id: -2, label: "-2 Octaves" },
];

const MODULE_OPTIONS: ReadonlyArray<{ id: HarmonicModuleId; label: string; subtitle: string }> = [
  { id: "progressions", label: "Progressions", subtitle: "Major" },
  { id: "dark-harmony", label: "Dark Harmony", subtitle: "Tonal Minor" },
];

const PITCH_CLASSES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

export function MatrixContextMenu({
  position,
  invoker,
  activeModule,
  tonic,
  globalView,
  showBassInStaff,
  suzukiColors = false,
  resolutionArrows = true,
  currentArticulation = "humanized",
  currentRegister = "auto",
  hasPreviewSelection = false,
  isRecommendationsActive = false,
  onResetCurrentModule,
  onResetAllModules,
  onResetTemplateDefaults,
  onSetModule,
  onTranspose,
  onSetTonic,
  onSetView,
  onToggleBassInStaff,
  onToggleSuzukiColors,
  onToggleResolutionArrows,
  onSetArticulation,
  onSetRegister,
  onToggleRecommendations,
  onClearSelection,
  onClose,
}: MatrixContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [activeSubmenu, setActiveSubmenu] = useState<
    "transpose" | "module" | "view" | "articulation" | "register" | null
  >(null);
  const [submenuTop, setSubmenuTop] = useState(0);

  const mode = modeForModule(activeModule);
  const currentKeyLabel = formatPitchSpelling(defaultTonicSpelling(tonic, mode));
  const currentModuleLabel =
    MODULE_OPTIONS.find((opt) => opt.id === activeModule)?.label ?? activeModule;

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

  const openSubmenu = (
    type: "transpose" | "module" | "view" | "articulation" | "register",
    btnEl: HTMLButtonElement,
  ) => {
    const rect = btnEl.getBoundingClientRect();
    setSubmenuTop(rect.top);
    setActiveSubmenu(type);
  };

  const toggleSubmenu = (
    type: "transpose" | "module" | "view" | "articulation" | "register",
    btnEl: HTMLButtonElement,
  ) => {
    if (activeSubmenu === type) {
      setActiveSubmenu(null);
    } else {
      openSubmenu(type, btnEl);
    }
  };

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
      const parentBtn = menuRef.current?.querySelector<HTMLButtonElement>(
        `[data-submenu="${currentSubmenu}"]`,
      );
      parentBtn?.focus();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = itemRefs.current.filter((item): item is HTMLButtonElement => Boolean(item));
    const active = document.activeElement as HTMLButtonElement | null;
    const currentIndex = active ? items.indexOf(active) : -1;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        event.stopPropagation();
        if (currentIndex === -1 || currentIndex === items.length - 1) {
          items[0]?.focus();
        } else {
          items[currentIndex + 1]?.focus();
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        event.stopPropagation();
        if (currentIndex <= 0) {
          items[items.length - 1]?.focus();
        } else {
          items[currentIndex - 1]?.focus();
        }
        break;
      case "ArrowRight": {
        const currentBtn = items[currentIndex];
        const submenuType = currentBtn?.getAttribute("data-submenu") as
          | "transpose"
          | "module"
          | "view"
          | "articulation"
          | "register"
          | null;
        if (submenuType && currentBtn) {
          event.preventDefault();
          event.stopPropagation();
          openSubmenu(submenuType, currentBtn);
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

  const registerRef = (index: number) => (node: HTMLButtonElement | null) => {
    itemRefs.current[index] = node;
  };

  const menuWidth = menuRef.current?.getBoundingClientRect().width ?? 220;
  const submenuX =
    adjustedPosition.x + menuWidth + 215 < window.innerWidth
      ? adjustedPosition.x + menuWidth + 2
      : Math.max(8, adjustedPosition.x - 200);

  if (typeof document === "undefined") {
    return null;
  }

  let btnIndex = 0;

  return createPortal(
    <>
      <div
        ref={menuRef}
        className="melody-context-menu matrix-context-menu"
        role="menu"
        aria-label="Harmonic Matrix Actions"
        tabIndex={-1}
        style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
        onKeyDownCapture={handleKeyDown}
        data-testid="matrix-context-menu"
      >
        <div className="progression-menu-header">
          <span className="progression-menu-title">Harmonic Matrix</span>
          <span className="progression-menu-subtitle">
            {currentKeyLabel} · {currentModuleLabel}
          </span>
        </div>

        {/* 1. Card Templates & Reset */}
        <div className="score-system-menu-separator" role="separator" />
        <div className="score-system-menu-group-header">Card Templates &amp; Reset</div>
        <button
          ref={registerRef(btnIndex++)}
          type="button"
          role="menuitem"
          className="score-system-menu-item"
          data-testid="matrix-menu-reset-current-module"
          onClick={() => {
            onResetCurrentModule?.();
            onClose();
          }}
        >
          <span className="score-system-menu-item-row">
            <span>Reset Current Module Cards</span>
          </span>
        </button>
        <button
          ref={registerRef(btnIndex++)}
          type="button"
          role="menuitem"
          className="score-system-menu-item"
          data-testid="matrix-menu-reset-all-modules"
          onClick={() => {
            onResetAllModules?.();
            onClose();
          }}
        >
          <span className="score-system-menu-item-row">
            <span>Reset All Cards Across Modules</span>
          </span>
        </button>
        <button
          ref={registerRef(btnIndex++)}
          type="button"
          role="menuitem"
          className="score-system-menu-item"
          data-testid="matrix-menu-reset-template-defaults"
          onClick={() => {
            onResetTemplateDefaults?.();
            onClose();
          }}
        >
          <span className="score-system-menu-item-row">
            <span>Reset Matrix Template Defaults</span>
          </span>
        </button>

        {/* 2. Key & Harmony */}
        <div className="score-system-menu-separator" role="separator" />
        <div className="score-system-menu-group-header">Key &amp; Harmony</div>
        <button
          ref={registerRef(btnIndex++)}
          type="button"
          role="menuitem"
          className="score-system-menu-item has-submenu"
          data-submenu="transpose"
          data-testid="matrix-menu-open-transpose"
          onMouseEnter={(e) => openSubmenu("transpose", e.currentTarget)}
          onClick={(e) => toggleSubmenu("transpose", e.currentTarget)}
        >
          <span className="score-system-menu-item-row">
            <span>Transpose Matrix</span>
            <span className="score-system-submenu-arrow">›</span>
          </span>
        </button>
        <button
          ref={registerRef(btnIndex++)}
          type="button"
          role="menuitem"
          className="score-system-menu-item has-submenu"
          data-submenu="module"
          data-testid="matrix-menu-open-module"
          onMouseEnter={(e) => openSubmenu("module", e.currentTarget)}
          onClick={(e) => toggleSubmenu("module", e.currentTarget)}
        >
          <span className="score-system-menu-item-row">
            <span>Harmonic Module</span>
            <span className="score-system-submenu-arrow">›</span>
          </span>
        </button>

        {/* 3. Card Presentation */}
        <div className="score-system-menu-separator" role="separator" />
        <div className="score-system-menu-group-header">Card Presentation</div>
        <button
          ref={registerRef(btnIndex++)}
          type="button"
          role="menuitem"
          className="score-system-menu-item has-submenu"
          data-submenu="view"
          data-testid="matrix-menu-open-view"
          onMouseEnter={(e) => openSubmenu("view", e.currentTarget)}
          onClick={(e) => toggleSubmenu("view", e.currentTarget)}
        >
          <span className="score-system-menu-item-row">
            <span>Card View Mode</span>
            <span className="score-system-submenu-arrow">›</span>
          </span>
        </button>
        <button
          ref={registerRef(btnIndex++)}
          type="button"
          role="menuitem"
          className="score-system-menu-item"
          data-testid="matrix-menu-toggle-bass"
          onClick={() => {
            onToggleBassInStaff?.();
            onClose();
          }}
        >
          <span className="score-system-menu-item-row">
            <span>Show Bass in Staff</span>
            {showBassInStaff ? <span className="score-system-menu-check">✓</span> : null}
          </span>
        </button>
        <button
          ref={registerRef(btnIndex++)}
          type="button"
          role="menuitem"
          className="score-system-menu-item"
          data-testid="matrix-menu-toggle-suzuki-colors"
          onClick={() => {
            onToggleSuzukiColors?.();
            onClose();
          }}
        >
          <span className="score-system-menu-item-row">
            <span>Suzuki Note Colors</span>
            {suzukiColors ? <span className="score-system-menu-check">✓</span> : null}
          </span>
        </button>
        <button
          ref={registerRef(btnIndex++)}
          type="button"
          role="menuitem"
          className="score-system-menu-item"
          data-testid="matrix-menu-toggle-resolution-arrows"
          onClick={() => {
            onToggleResolutionArrows?.();
            onClose();
          }}
        >
          <span className="score-system-menu-item-row">
            <span>Resolution Arrows</span>
            {resolutionArrows ? <span className="score-system-menu-check">✓</span> : null}
          </span>
        </button>

        {/* 4. Matrix Audition */}
        <div className="score-system-menu-separator" role="separator" />
        <div className="score-system-menu-group-header">Matrix Audition</div>
        <button
          ref={registerRef(btnIndex++)}
          type="button"
          role="menuitem"
          className="score-system-menu-item has-submenu"
          data-submenu="articulation"
          data-testid="matrix-menu-open-articulation"
          onMouseEnter={(e) => openSubmenu("articulation", e.currentTarget)}
          onClick={(e) => toggleSubmenu("articulation", e.currentTarget)}
        >
          <span className="score-system-menu-item-row">
            <span>Audition Articulation</span>
            <span className="score-system-submenu-arrow">›</span>
          </span>
        </button>
        <button
          ref={registerRef(btnIndex++)}
          type="button"
          role="menuitem"
          className="score-system-menu-item has-submenu"
          data-submenu="register"
          data-testid="matrix-menu-open-register"
          onMouseEnter={(e) => openSubmenu("register", e.currentTarget)}
          onClick={(e) => toggleSubmenu("register", e.currentTarget)}
        >
          <span className="score-system-menu-item-row">
            <span>Audition Register</span>
            <span className="score-system-submenu-arrow">›</span>
          </span>
        </button>

        {/* 5. Assistance & Selection */}
        <div className="score-system-menu-separator" role="separator" />
        <div className="score-system-menu-group-header">Assistance &amp; Selection</div>
        <button
          ref={registerRef(btnIndex++)}
          type="button"
          role="menuitem"
          className="score-system-menu-item"
          data-testid="matrix-menu-toggle-recommendations"
          onClick={() => {
            onToggleRecommendations?.();
            onClose();
          }}
        >
          <span className="score-system-menu-item-row">
            <span>Recommendation Context</span>
            {isRecommendationsActive ? <span className="score-system-menu-check">✓</span> : null}
          </span>
        </button>
        {hasPreviewSelection ? (
          <button
            ref={registerRef(btnIndex++)}
            type="button"
            role="menuitem"
            className="score-system-menu-item"
            data-testid="matrix-menu-clear-selection"
            onClick={() => {
              onClearSelection?.();
              onClose();
            }}
          >
            <span className="score-system-menu-item-row">
              <span>Clear Card Selection</span>
              <span className="score-system-menu-shortcut">Esc</span>
            </span>
          </button>
        ) : null}
      </div>

      {/* SUBMENUS */}
      {activeSubmenu === "transpose" && (
        <div
          ref={submenuRef}
          className="melody-context-menu score-system-submenu matrix-submenu"
          role="menu"
          aria-label="Transpose Matrix"
          style={{ left: submenuX, top: Math.min(submenuTop, window.innerHeight - 360) }}
          onKeyDownCapture={handleSubmenuKeyDown}
          data-testid="matrix-submenu-transpose"
        >
          <div className="score-system-menu-group-header">Quick Shift</div>
          <button
            type="button"
            role="menuitem"
            className="score-system-menu-item"
            data-testid="matrix-menu-transpose-up"
            onClick={() => {
              onTranspose?.(1);
              onClose();
            }}
          >
            <span className="score-system-menu-item-row">
              <span>Transpose Up (+1)</span>
              <span className="score-system-menu-shortcut">+1 st</span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="score-system-menu-item"
            data-testid="matrix-menu-transpose-down"
            onClick={() => {
              onTranspose?.(-1);
              onClose();
            }}
          >
            <span className="score-system-menu-item-row">
              <span>Transpose Down (-1)</span>
              <span className="score-system-menu-shortcut">-1 st</span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="score-system-menu-item"
            data-testid="matrix-menu-transpose-fifth-cw"
            onClick={() => {
              onTranspose?.(7);
              onClose();
            }}
          >
            <span className="score-system-menu-item-row">
              <span>Circle of Fifths (+5th)</span>
              <span className="score-system-menu-shortcut">+7 st</span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="score-system-menu-item"
            data-testid="matrix-menu-transpose-fifth-ccw"
            onClick={() => {
              onTranspose?.(5);
              onClose();
            }}
          >
            <span className="score-system-menu-item-row">
              <span>Circle of Fifths (-5th)</span>
              <span className="score-system-menu-shortcut">-7 st</span>
            </span>
          </button>

          <div className="score-system-menu-separator" role="separator" />
          <div className="score-system-menu-group-header">All Root Keys</div>
          {PITCH_CLASSES.map((pc) => {
            const label = formatPitchSpelling(defaultTonicSpelling(pc, mode));
            const isActive = pc === tonic;
            return (
              <button
                key={pc}
                type="button"
                role="menuitem"
                className="score-system-menu-item"
                data-testid={`matrix-menu-tonic-${pc}`}
                onClick={() => {
                  onSetTonic?.(pc);
                  onClose();
                }}
              >
                <span className="score-system-menu-item-row">
                  <span>{label}</span>
                  {isActive ? <span className="score-system-menu-check">✓</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {activeSubmenu === "module" && (
        <div
          ref={submenuRef}
          className="melody-context-menu score-system-submenu matrix-submenu"
          role="menu"
          aria-label="Harmonic Module"
          style={{ left: submenuX, top: Math.min(submenuTop, window.innerHeight - 150) }}
          onKeyDownCapture={handleSubmenuKeyDown}
          data-testid="matrix-submenu-module"
        >
          {MODULE_OPTIONS.map((opt) => {
            const isActive = opt.id === activeModule;
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitem"
                className="score-system-menu-item"
                data-testid={`matrix-menu-module-${opt.id}`}
                onClick={() => {
                  onSetModule?.(opt.id);
                  onClose();
                }}
              >
                <span className="score-system-menu-item-row">
                  <span>
                    {opt.label} <small style={{ color: "var(--text-muted)" }}>({opt.subtitle})</small>
                  </span>
                  {isActive ? <span className="score-system-menu-check">✓</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {activeSubmenu === "view" && (
        <div
          ref={submenuRef}
          className="melody-context-menu score-system-submenu matrix-submenu"
          role="menu"
          aria-label="Card View Mode"
          style={{ left: submenuX, top: Math.min(submenuTop, window.innerHeight - 150) }}
          onKeyDownCapture={handleSubmenuKeyDown}
          data-testid="matrix-submenu-view"
        >
          {[
            { id: "harmonic" as const, label: "Harmonic View [H]" },
            { id: "piano" as const, label: "Piano View [P]" },
            { id: "staff" as const, label: "Staff View [S]" },
            { id: "guitar" as const, label: "Guitar View [G]" },
          ].map((item) => {
            const isActive = item.id === globalView;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className="score-system-menu-item"
                data-testid={`matrix-menu-view-${item.id}`}
                onClick={() => {
                  onSetView?.(item.id);
                  onClose();
                }}
              >
                <span className="score-system-menu-item-row">
                  <span>{item.label}</span>
                  {isActive ? <span className="score-system-menu-check">✓</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {activeSubmenu === "articulation" && (
        <div
          ref={submenuRef}
          className="melody-context-menu score-system-submenu matrix-submenu"
          role="menu"
          aria-label="Audition Articulation"
          style={{ left: submenuX, top: Math.min(submenuTop, window.innerHeight - 220) }}
          onKeyDownCapture={handleSubmenuKeyDown}
          data-testid="matrix-submenu-articulation"
        >
          {ARTICULATIONS.map((art) => {
            const isActive = art.id === currentArticulation;
            return (
              <button
                key={art.id}
                type="button"
                role="menuitem"
                className="score-system-menu-item"
                data-testid={`matrix-menu-articulation-${art.id}`}
                onClick={() => {
                  onSetArticulation?.(art.id);
                  onClose();
                }}
              >
                <span className="score-system-menu-item-row">
                  <span>{art.label}</span>
                  {isActive ? <span className="score-system-menu-check">✓</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {activeSubmenu === "register" && (
        <div
          ref={submenuRef}
          className="melody-context-menu score-system-submenu matrix-submenu"
          role="menu"
          aria-label="Audition Register"
          style={{ left: submenuX, top: Math.min(submenuTop, window.innerHeight - 240) }}
          onKeyDownCapture={handleSubmenuKeyDown}
          data-testid="matrix-submenu-register"
        >
          {REGISTERS.map((reg) => {
            const isActive = reg.id === currentRegister;
            return (
              <button
                key={String(reg.id)}
                type="button"
                role="menuitem"
                className="score-system-menu-item"
                data-testid={`matrix-menu-register-${reg.id}`}
                onClick={() => {
                  onSetRegister?.(reg.id);
                  onClose();
                }}
              >
                <span className="score-system-menu-item-row">
                  <span>{reg.label}</span>
                  {isActive ? <span className="score-system-menu-check">✓</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>,
    document.body,
  );
}
