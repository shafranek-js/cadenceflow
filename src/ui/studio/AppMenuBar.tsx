import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { CardViewId } from "../../domain/progression/step";
import type { ProgressionView } from "../../domain/project/project";

type AppMenuId = "export" | "edit" | "view";

const CARD_VIEWS: readonly { id: CardViewId; label: string }[] = [
  { id: "harmonic", label: "Harmonic" },
  { id: "piano", label: "Piano" },
  { id: "staff", label: "Staff" },
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
            {CARD_VIEWS.map((view) => (
              <button
                key={view.id}
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
            {CARD_VIEWS.map((view) => (
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
          </div>
        ) : null}
      </div>
    </nav>
  );
}
