import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../common/Icon";
import { useModalFocus } from "../common/useModalFocus";
import type { GlobalSettingsVisibility } from "./globalSettings";

export function GlobalSettingsControl({
  value,
  onChange,
}: {
  readonly value: GlobalSettingsVisibility;
  readonly onChange: (next: GlobalSettingsVisibility) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const panelRef = useModalFocus<HTMLElement>({
    isOpen: open,
    onClose: close,
    restoreFocusRef: triggerRef,
  });

  useEffect(() => {
    if (!open) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || rootRef.current?.contains(target)) return;
      close();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
  }, [close, open]);

  return (
    <div ref={rootRef} className="global-settings-control">
      <button
        ref={triggerRef}
        type="button"
        className="global-settings-trigger"
        aria-label="Global settings"
        aria-expanded={open}
        aria-controls="global-settings-panel"
        data-testid="global-settings-toggle"
        title="Global settings"
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="settings" />
      </button>

      {open ? (
        <section
          ref={panelRef}
          id="global-settings-panel"
          className="global-settings-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="global-settings-title"
          data-testid="global-settings-panel"
          tabIndex={-1}
        >
          <header className="global-settings-header">
            <div>
              <span className="inspector-context-kicker">Application preferences</span>
              <h2 id="global-settings-title">Global Settings</h2>
            </div>
            <button
              type="button"
              className="dialog-close-btn"
              aria-label="Close global settings"
              onClick={close}
            >
              <Icon name="close" />
            </button>
          </header>
          <p className="global-settings-description">
            Choose which optional controls stay visible in the Studio.
          </p>
          <div className="global-settings-options">
            <label className="global-setting-option">
              <input
                type="checkbox"
                checked={value.showProjectTabs}
                aria-label="Show project tabs"
                data-testid="show-project-tabs"
                onChange={(event) => onChange({ ...value, showProjectTabs: event.target.checked })}
              />
              <span>
                <strong>Project tabs</strong>
                <small>Show open project tabs below the application menu.</small>
              </span>
            </label>
            <label className="global-setting-option">
              <input
                type="checkbox"
                checked={value.showThemeControl}
                aria-label="Show theme switcher"
                data-testid="show-theme-control"
                onChange={(event) => onChange({ ...value, showThemeControl: event.target.checked })}
              />
              <span>
                <strong>Theme switcher</strong>
                <small>Show dark/light theme controls in the header.</small>
              </span>
            </label>
            <label className="global-setting-option">
              <input
                type="checkbox"
                checked={value.showExpertiseControl}
                aria-label="Show expertise switcher"
                data-testid="show-expertise-control"
                onChange={(event) =>
                  onChange({ ...value, showExpertiseControl: event.target.checked })
                }
              />
              <span>
                <strong>Expertise switcher</strong>
                <small>Show Beginner, Composer, and Expert controls.</small>
              </span>
            </label>
            <label className="global-setting-option">
              <input
                type="checkbox"
                checked={value.showHistoryControls}
                aria-label="Show Undo and Redo controls"
                data-testid="show-history-controls"
                onChange={(event) =>
                  onChange({ ...value, showHistoryControls: event.target.checked })
                }
              />
              <span>
                <strong>Undo / Redo controls</strong>
                <small>Keep history buttons visible in the transport bar.</small>
              </span>
            </label>
            <label className="global-setting-option">
              <input
                type="checkbox"
                checked={value.showRecommendationContext}
                aria-label="Show recommendation context"
                data-testid="show-recommendation-context"
                onChange={(event) =>
                  onChange({ ...value, showRecommendationContext: event.target.checked })
                }
              />
              <span>
                <strong>Recommendation context</strong>
                <small>Show the harmonic explanation panel in the Inspector.</small>
              </span>
            </label>
            <label className="global-setting-option">
              <input
                type="checkbox"
                checked={value.showPreviewHarmony}
                aria-label="Show preview harmony"
                data-testid="show-preview-harmony"
                onChange={(event) =>
                  onChange({ ...value, showPreviewHarmony: event.target.checked })
                }
              />
              <span>
                <strong>Preview harmony</strong>
                <small>Show the selected chord's harmonic details in the Inspector.</small>
              </span>
            </label>
          </div>
        </section>
      ) : null}
    </div>
  );
}
