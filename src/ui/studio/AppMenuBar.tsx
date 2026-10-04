import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { CardViewId } from "../../domain/progression/step";
import type { GuitarChordColorMode, ProgressionView } from "../../domain/project/project";

type AppMenuId = "export" | "edit" | "view" | "help";

const MATRIX_CARD_VIEWS: readonly { id: CardViewId; label: string }[] = [
  { id: "harmonic", label: "Harmonic" },
  { id: "piano", label: "Piano" },
  { id: "staff", label: "Staff" },
  { id: "guitar", label: "Guitar" },
];

const PROGRESSION_VIEWS: readonly { id: ProgressionView; label: string }[] = [
  { id: "harmonic", label: "Harmonic" },
  { id: "piano", label: "Piano" },
  { id: "staff", label: "Staff" },
  { id: "guitar", label: "Guitar" },
  { id: "tablature", label: "Tablature" },
  { id: "piano-roll", label: "Piano Roll" },
];

export interface AppMenuBarProps {
  readonly projectMenu: ReactNode;
  readonly exportMenu: ReactNode;
  readonly canUndo: boolean;
  readonly onUndo: () => void;
  readonly canRedo: boolean;
  readonly onRedo: () => void;
  readonly cardView: CardViewId;
  readonly onCardViewChange: (view: CardViewId) => void;
  readonly progressionView: ProgressionView;
  readonly onProgressionViewChange: (view: ProgressionView) => void;
  readonly showBassInStaff: boolean;
  readonly onShowBassInStaffChange: (visible: boolean) => void;
  readonly suzukiColors?: boolean;
  readonly onSuzukiColorsChange?: (enabled: boolean) => void;
  readonly resolutionArrows?: boolean;
  readonly onResolutionArrowsChange?: (enabled: boolean) => void;
  readonly guitarChordOrientation?: "vertical" | "horizontal";
  readonly onGuitarChordOrientationChange?: (orientation: "vertical" | "horizontal") => void;
  readonly guitarChordColorMode?: GuitarChordColorMode;
  readonly onGuitarChordColorModeChange?: (mode: GuitarChordColorMode) => void;
  readonly sidePanelMode?: "fixed" | "autohide";
  readonly onSidePanelModeChange?: (mode: "fixed" | "autohide") => void;
  readonly onOpenModesExplorer?: () => void;
  readonly onOpenHelp?: () => void;
  readonly onOpenFingeringLegend?: () => void;
  readonly onOpenShortcutsHelp?: () => void;
}

export function AppMenuBar({
  projectMenu,
  exportMenu,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  cardView,
  onCardViewChange,
  progressionView,
  onProgressionViewChange,
  showBassInStaff,
  onShowBassInStaffChange,
  suzukiColors = false,
  onSuzukiColorsChange,
  resolutionArrows = true,
  onResolutionArrowsChange,
  guitarChordOrientation = "vertical",
  onGuitarChordOrientationChange,
  guitarChordColorMode = "chord-roles",
  onGuitarChordColorModeChange,
  sidePanelMode = "fixed",
  onSidePanelModeChange,
  onOpenModesExplorer,
  onOpenHelp,
  onOpenFingeringLegend,
  onOpenShortcutsHelp,
}: AppMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<AppMenuId | null>(null);
  const menuBarRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef<Partial<Record<AppMenuId, HTMLButtonElement | null>>>({});

  useEffect(() => {
    if (!openMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const ownMenu = (target as Element).closest(".app-menu-dropdown");
      const projectMenu = (target as Element).closest(".project-manager");
      if (!ownMenu || projectMenu) setOpenMenu(null);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      const trigger = triggerRefs.current[openMenu];
      setOpenMenu(null);
      trigger?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) return;
    const menu = menuBarRef.current?.querySelector<HTMLElement>(
      `[data-menu="${openMenu}"] [role="menuitem"], [data-menu="${openMenu}"] [role="menuitemradio"], [data-menu="${openMenu}"] [role="menuitemcheckbox"]`,
    );
    menu?.focus();
  }, [openMenu]);

  const closeMenu = (menu: AppMenuId) => {
    setOpenMenu(null);
    triggerRefs.current[menu]?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]',
      ),
    ).filter((item) => !(item as HTMLButtonElement).disabled);
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  return (
    <nav ref={menuBarRef} className="app-menu-bar" role="menubar" aria-label="Application menu">
      <div className="app-menu-project-slot">{projectMenu}</div>

      <div className="app-menu-dropdown">
        <button
          ref={(element) => {
            triggerRefs.current.export = element;
          }}
          type="button"
          className="app-menu-trigger"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={openMenu === "export"}
          aria-controls="export-menu"
          data-testid="export-menu-toggle"
          onClick={() => setOpenMenu((current) => (current === "export" ? null : "export"))}
        >
          Export
        </button>
        {openMenu === "export" ? (
          <div
            id="export-menu"
            className="app-menu-popup"
            data-menu="export"
            role="menu"
            aria-label="Export menu"
            onKeyDown={handleMenuKeyDown}
          >
            {exportMenu}
          </div>
        ) : null}
      </div>

      <div className="app-menu-dropdown">
        <button
          ref={(element) => {
            triggerRefs.current.edit = element;
          }}
          type="button"
          className="app-menu-trigger"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={openMenu === "edit"}
          aria-controls="edit-menu"
          data-testid="edit-menu-toggle"
          onClick={() => setOpenMenu((current) => (current === "edit" ? null : "edit"))}
        >
          Edit
        </button>
        {openMenu === "edit" ? (
          <div
            id="edit-menu"
            className="app-menu-popup"
            data-menu="edit"
            role="menu"
            aria-label="Edit menu"
            onKeyDown={handleMenuKeyDown}
          >
            <button
              type="button"
              role="menuitem"
              disabled={!canUndo}
              onClick={() => {
                onUndo();
                closeMenu("edit");
              }}
            >
              <span>Undo</span>
              <kbd>Ctrl+Z</kbd>
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!canRedo}
              onClick={() => {
                onRedo();
                closeMenu("edit");
              }}
            >
              <span>Redo</span>
              <kbd>Ctrl+Shift+Z</kbd>
            </button>
          </div>
        ) : null}
      </div>

      <div className="app-menu-dropdown">
        <button
          ref={(element) => {
            triggerRefs.current.view = element;
          }}
          type="button"
          className="app-menu-trigger"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={openMenu === "view"}
          aria-controls="view-menu"
          data-testid="view-menu-toggle"
          onClick={() => setOpenMenu((current) => (current === "view" ? null : "view"))}
        >
          View
        </button>
        {openMenu === "view" ? (
          <div
            id="view-menu"
            className="app-menu-popup"
            data-menu="view"
            role="menu"
            aria-label="View menu"
            onKeyDown={handleMenuKeyDown}
          >
            <div className="app-menu-section-label">Matrix card view</div>
            {MATRIX_CARD_VIEWS.map((view) => (
              <button
                key={`matrix-${view.id}`}
                type="button"
                role="menuitemradio"
                aria-checked={cardView === view.id}
                data-testid={`matrix-card-view-${view.id}`}
                onClick={() => {
                  onCardViewChange(view.id);
                  closeMenu("view");
                }}
              >
                <span>{view.label}</span>
                {cardView === view.id ? <span aria-hidden="true">✓</span> : null}
              </button>
            ))}
            <div className="app-menu-section-label">My Progression view</div>
            {PROGRESSION_VIEWS.map((view) => (
              <button
                key={`progression-${view.id}`}
                type="button"
                role="menuitemradio"
                aria-checked={progressionView === view.id}
                data-testid={`progression-card-view-${view.id}`}
                onClick={() => {
                  onProgressionViewChange(view.id);
                  closeMenu("view");
                }}
              >
                <span>{view.label}</span>
                {progressionView === view.id ? <span aria-hidden="true">✓</span> : null}
              </button>
            ))}
            <div className="app-menu-section-label">Staff view</div>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={showBassInStaff}
              data-testid="show-bass-in-staff"
              onClick={() => {
                onShowBassInStaffChange(!showBassInStaff);
                closeMenu("view");
              }}
            >
              <span>Show bass note</span>
              {showBassInStaff ? <span aria-hidden="true">✓</span> : null}
            </button>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={suzukiColors}
              data-testid="toggle-suzuki-colors"
              onClick={() => {
                onSuzukiColorsChange?.(!suzukiColors);
                closeMenu("view");
              }}
            >
              <span>Suzuki note colors</span>
              {suzukiColors ? <span aria-hidden="true">✓</span> : null}
            </button>
            <div className="app-menu-section-label">Guitar view</div>
            {(
              [
                { id: "chord-roles", label: "Chord roles" },
                { id: "fingering", label: "Fingering colors" },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                role="menuitemradio"
                aria-checked={guitarChordColorMode === mode.id}
                data-testid={`guitar-chord-color-mode-${mode.id}`}
                onClick={() => {
                  onGuitarChordColorModeChange?.(mode.id);
                  closeMenu("view");
                }}
              >
                <span>{mode.label}</span>
                {guitarChordColorMode === mode.id ? <span aria-hidden="true">✓</span> : null}
              </button>
            ))}
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={guitarChordOrientation === "horizontal"}
              data-testid="toggle-guitar-orientation"
              onClick={() => {
                onGuitarChordOrientationChange?.(
                  guitarChordOrientation === "horizontal" ? "vertical" : "horizontal",
                );
                closeMenu("view");
              }}
            >
              <span>Rotate guitar chords 90° (horizontal)</span>
              {guitarChordOrientation === "horizontal" ? <span aria-hidden="true">✓</span> : null}
            </button>
            <div className="app-menu-section-label">Matrix presentation</div>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={resolutionArrows}
              data-testid="toggle-resolution-arrows"
              onClick={() => {
                onResolutionArrowsChange?.(!resolutionArrows);
                closeMenu("view");
              }}
            >
              <span>Resolution arrows</span>
              {resolutionArrows ? <span aria-hidden="true">✓</span> : null}
            </button>
            <div className="app-menu-section-label">Panels & Layout</div>
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={sidePanelMode === "autohide"}
              data-testid="toggle-side-panel-mode"
              onClick={() => {
                onSidePanelModeChange?.(sidePanelMode === "autohide" ? "fixed" : "autohide");
                closeMenu("view");
              }}
            >
              <span>Auto-hide side panels</span>
              {sidePanelMode === "autohide" ? <span aria-hidden="true">✓</span> : null}
            </button>
            {onOpenModesExplorer ? (
              <>
                <div className="app-menu-section-label">Theory tools</div>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="menu-open-modes-explorer"
                  onClick={() => {
                    onOpenModesExplorer();
                    closeMenu("view");
                  }}
                >
                  <span>🎼 Scales & Modes Explorer...</span>
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="app-menu-dropdown">
        <button
          ref={(element) => {
            triggerRefs.current.help = element;
          }}
          type="button"
          className="app-menu-trigger"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={openMenu === "help"}
          aria-controls="help-menu"
          data-testid="help-menu-toggle"
          onClick={() => setOpenMenu((current) => (current === "help" ? null : "help"))}
        >
          Help
        </button>
        {openMenu === "help" ? (
          <div
            id="help-menu"
            className="app-menu-popup"
            data-menu="help"
            role="menu"
            aria-label="Help menu"
            onKeyDown={handleMenuKeyDown}
          >
            <button
              type="button"
              role="menuitem"
              data-testid="menu-open-help-center"
              onClick={() => {
                onOpenHelp?.();
                closeMenu("help");
              }}
            >
              <span>📖 Справочный центр...</span>
              <kbd>F1</kbd>
            </button>
            {onOpenFingeringLegend ? (
              <button
                type="button"
                role="menuitem"
                data-testid="menu-open-fingering-legend"
                onClick={() => {
                  onOpenFingeringLegend();
                  closeMenu("help");
                }}
              >
                <span>🖐 Аппликатура левой руки...</span>
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              data-testid="menu-open-shortcuts"
              onClick={() => {
                onOpenShortcutsHelp?.();
                closeMenu("help");
              }}
            >
              <span>⌨️ Горячие клавиши...</span>
            </button>
            <div className="app-menu-section-label">О приложении</div>
            <button
              type="button"
              role="menuitem"
              data-testid="menu-open-about"
              onClick={() => {
                onOpenHelp?.();
                closeMenu("help");
              }}
            >
              <span>ℹ️ О CadenceFlow 1.0</span>
            </button>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
