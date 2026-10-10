import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface StaffAnchor {
  readonly stepId: string;
  readonly systemIndex: string;
  readonly targetKey?: string;
}

function staffTargetKey(target: HTMLElement): string | undefined {
  const harmonyEvent = target.closest<HTMLElement>(".measure-staff-event");
  if (harmonyEvent?.dataset.staffItemKey) return `harmony:${harmonyEvent.dataset.staffItemKey}`;
  if (target.dataset.melodyEventKey) return `melody:${target.dataset.melodyEventKey}`;
  return undefined;
}

export interface StudioWorkspaceProps {
  readonly header: ReactNode;
  readonly transport: ReactNode;
  readonly matrix: ReactNode;
  readonly inspector: ReactNode;
  readonly selectedStepQuickEdit?: ReactNode;
  readonly selectedStepInspector?: ReactNode;
  readonly progression: ReactNode;
  readonly printable?: ReactNode;
  readonly statusBar?: ReactNode;
  readonly bottomPanel?: ReactNode;
  readonly onProgressionBackgroundClick?: () => void;
  readonly onMatrixBackgroundClick?: () => void;
  readonly overlays?: ReactNode;
  readonly sidePanelMode?: "fixed" | "autohide";
  readonly onSidePanelModeChange?: (mode: "fixed" | "autohide") => void;
}

/**
 * Presentational shell for the desktop studio.
 *
 * App owns project state, history, transport state, and command handlers. This
 * component only provides stable semantic regions for those already-rendered
 * UI slots, so switching layout does not remount the domain controls.
 */
export function StudioWorkspace({
  header,
  transport,
  matrix,
  inspector,
  selectedStepQuickEdit,
  selectedStepInspector,
  progression,
  printable,
  statusBar,
  bottomPanel,
  onProgressionBackgroundClick,
  onMatrixBackgroundClick,
  overlays,
  sidePanelMode = "fixed",
  onSidePanelModeChange,
}: StudioWorkspaceProps) {
  const [midiSettingsOpen, setMidiSettingsOpen] = useState(false);
  const midiSettingsEntryRef = useRef<HTMLButtonElement>(null);
  const midiPanelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (midiSettingsOpen) {
      const panel = midiPanelRef.current;
      if (!panel) return;
      const headerHeight =
        document.querySelector(".app-header")?.getBoundingClientRect().height ?? 0;
      panel.style.setProperty("--midi-header-height", `${headerHeight}px`);
      panel.focus({ preventScroll: true });
      window.scrollBy({ top: panel.getBoundingClientRect().top - headerHeight - 12 });
    }
  }, [midiSettingsOpen]);
  useEffect(() => {
    const headerElement = document.querySelector(".app-header");
    if (!headerElement || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      midiPanelRef.current?.style.setProperty(
        "--midi-header-height",
        `${headerElement.getBoundingClientRect().height}px`,
      );
    });
    observer.observe(headerElement);
    return () => observer.disconnect();
  }, []);
  const closeMidiSettings = () => {
    setMidiSettingsOpen(false);
    midiSettingsEntryRef.current?.focus({ preventScroll: true });
  };
  const hasSelectedStep = Boolean(selectedStepQuickEdit || selectedStepInspector);
  const progressionStripRef = useRef<HTMLElement>(null);
  const staffAnchorRef = useRef<StaffAnchor | null>(null);
  const inspectorStackRef = useRef<HTMLElement>(null);
  const selectedStepStackRef = useRef<HTMLElement>(null);
  const [offsetY, setOffsetY] = useState(0);

  const [isHovered, setIsHovered] = useState(false);
  const leaveTimerRef = useRef<number | null>(null);

  const cancelLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current !== null) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const scheduleLeave = useCallback(() => {
    cancelLeaveTimer();
    leaveTimerRef.current = window.setTimeout(() => {
      const activeEl = document.activeElement;
      const hasFocusInside =
        (inspectorStackRef.current?.contains(activeEl) ?? false) ||
        (selectedStepStackRef.current?.contains(activeEl) ?? false);
      if (!hasFocusInside) {
        setIsHovered(false);
      }
    }, 260);
  }, [cancelLeaveTimer]);

  const handleMouseEnter = () => {
    cancelLeaveTimer();
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    scheduleLeave();
  };

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current !== null) {
        window.clearTimeout(leaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (sidePanelMode !== "autohide") return;

    const handlePointerMove = (event: MouseEvent) => {
      if (window.innerWidth <= 1100) return;

      const edgeThreshold = 24;
      const sidebarZoneWidth = 340;
      const distFromRight = window.innerWidth - event.clientX;

      if (distFromRight <= edgeThreshold) {
        cancelLeaveTimer();
        setIsHovered(true);
      } else if (distFromRight > sidebarZoneWidth) {
        const activeEl = document.activeElement;
        const hasFocusInside =
          (inspectorStackRef.current?.contains(activeEl) ?? false) ||
          (selectedStepStackRef.current?.contains(activeEl) ?? false);
        if (!hasFocusInside) {
          scheduleLeave();
        }
      } else {
        cancelLeaveTimer();
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("mousemove", handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("mousemove", handlePointerMove);
    };
  }, [sidePanelMode, cancelLeaveTimer, scheduleLeave]);

  const isCollapsed = sidePanelMode === "autohide" && !isHovered && !midiSettingsOpen;

  useLayoutEffect(() => {
    if (!hasSelectedStep) {
      setOffsetY(0);
      staffAnchorRef.current = null;
      return;
    }

    const updateOffset = () => {
      const strip = progressionStripRef.current;
      if (!strip) return;

      const staffTargets = Array.from(
        strip.querySelectorAll<HTMLElement>(
          ".score-system .measure-staff-event > .measure-staff-event-select, .score-system .melody-staff-note",
        ),
      );
      const selectedStaffTargets = staffTargets.filter(
        (target) =>
          target.classList.contains("is-selected") ||
          target.closest(".measure-staff-event")?.classList.contains("is-selected"),
      );
      const previousStaffAnchor = staffAnchorRef.current;
      const selectedStaffStepId = selectedStaffTargets.find((target) => target.dataset.stepId)
        ?.dataset.stepId;
      const activeElement = document.activeElement;
      const focusedStaffTarget =
        activeElement instanceof HTMLElement
          ? activeElement.closest<HTMLElement>(
              ".score-system .measure-staff-event-select, .score-system .melody-staff-note",
            )
          : null;
      const focusedStaffStepId = focusedStaffTarget?.dataset.stepId;
      const staffStepId =
        focusedStaffStepId && (!selectedStaffStepId || focusedStaffStepId === selectedStaffStepId)
          ? focusedStaffStepId
          : (selectedStaffStepId ??
            (strip.querySelector(".score-system") ? previousStaffAnchor?.stepId : undefined));

      let staffSystem: HTMLElement | null = null;
      let anchorTargetKey: string | undefined;
      if (staffStepId && focusedStaffTarget?.dataset.stepId === staffStepId) {
        staffSystem = focusedStaffTarget.closest<HTMLElement>(".score-system");
        anchorTargetKey = staffTargetKey(focusedStaffTarget);
      }

      if (!staffSystem && staffStepId && previousStaffAnchor?.stepId === staffStepId) {
        const anchoredStaffTarget = previousStaffAnchor.targetKey
          ? staffTargets.find(
              (target) =>
                target.dataset.stepId === staffStepId &&
                staffTargetKey(target) === previousStaffAnchor.targetKey,
            )
          : undefined;
        staffSystem = anchoredStaffTarget?.closest<HTMLElement>(".score-system") ?? null;
        anchorTargetKey = anchoredStaffTarget ? staffTargetKey(anchoredStaffTarget) : undefined;

        if (!staffSystem) {
          staffSystem =
            Array.from(strip.querySelectorAll<HTMLElement>(".score-system")).find(
              (system) => system.dataset.systemIndex === previousStaffAnchor.systemIndex,
            ) ?? null;
        }
      }

      if (!staffSystem && staffStepId) {
        const selectedStaffTarget = selectedStaffTargets.find(
          (target) => target.dataset.stepId === staffStepId,
        );
        staffSystem = selectedStaffTarget?.closest<HTMLElement>(".score-system") ?? null;
        anchorTargetKey = selectedStaffTarget ? staffTargetKey(selectedStaffTarget) : undefined;
      }

      if (staffSystem && staffStepId) {
        staffAnchorRef.current = {
          stepId: staffStepId,
          systemIndex: staffSystem.dataset.systemIndex ?? "",
          ...(anchorTargetKey ? { targetKey: anchorTargetKey } : {}),
        };
      }

      /*
       * Staff targets are rendered inside their system, unlike Harmonic/Piano
       * cards. Keep the exact activated target as the anchor through layout
       * mutations so a continuation cannot move the inspector to its first DOM
       * occurrence after resize.
       */
      const selectedMeasure = strip.querySelector<HTMLElement>(
        ".progression-measure-card[data-has-selected-step='true']",
      );
      const targetCard =
        staffSystem ??
        selectedMeasure ??
        strip.querySelector<HTMLElement>(
          ".progression-step-card.is-selected, .progression-rest-card.is-selected",
        );

      if (!targetCard) {
        setOffsetY(0);
        return;
      }

      const stripRect = strip.getBoundingClientRect();
      const targetRect = targetCard.getBoundingClientRect();
      const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      const calculatedOffset = Math.max(0, Math.round((targetRect.top - stripRect.top) / zoom));
      setOffsetY(calculatedOffset);
    };

    updateOffset();

    const strip = progressionStripRef.current;
    if (!strip) return;

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        updateOffset();
      });
      resizeObserver.observe(strip);
    }

    let mutationObserver: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(() => {
        updateOffset();
      });
      mutationObserver.observe(strip, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-has-selected-step", "class"],
      });
    }

    window.addEventListener("resize", updateOffset);
    strip.addEventListener("focusin", updateOffset);

    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", updateOffset);
      strip.removeEventListener("focusin", updateOffset);
    };
  }, [hasSelectedStep, progression]);

  return (
    <main
      className={`app-shell${bottomPanel ? " has-bottom-panel" : ""}`}
      aria-label="CadenceFlow Studio"
    >
      <header
        className="app-header"
        aria-label="Project and application controls"
        aria-description="Scroll vertically when space is limited."
        tabIndex={0}
        data-playback-follow-ignore="true"
      >
        {header}
        <button
          ref={midiSettingsEntryRef}
          type="button"
          aria-expanded={midiSettingsOpen}
          aria-controls="midi-settings-panel"
          onClick={() => (midiSettingsOpen ? closeMidiSettings() : setMidiSettingsOpen(true))}
        >
          Midi Settings
        </button>
      </header>
      <section className="studio-transport" aria-label="Transport">
        {transport}
      </section>
      <section
        className={`studio-grid${hasSelectedStep ? " has-selected-step" : ""}${
          isCollapsed ? " is-collapsed" : ""
        }`}
        aria-label="Studio work area"
        onClick={(event) => {
          if (event.target === event.currentTarget) onMatrixBackgroundClick?.();
        }}
      >
        <div
          className="studio-matrix-area"
          onClick={(event) => {
            if (event.target === event.currentTarget) onMatrixBackgroundClick?.();
          }}
        >
          {matrix}
        </div>
        <aside
          ref={inspectorStackRef}
          className="inspector-stack"
          data-playback-follow-nested-scroll
          aria-label="Inspector"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onPointerEnter={handleMouseEnter}
          onPointerLeave={handleMouseLeave}
        >
          <div className="inspector-dock-header">
            <span className="inspector-dock-title">Inspector</span>
            <button
              type="button"
              className={`inspector-pin-button${sidePanelMode === "fixed" ? " is-pinned" : ""}`}
              title={
                sidePanelMode === "fixed"
                  ? "Unpin sidebar (enable auto-hide)"
                  : "Pin sidebar (always visible)"
              }
              aria-label={sidePanelMode === "fixed" ? "Unpin sidebar" : "Pin sidebar"}
              data-testid="toggle-pin-side-panel"
              onClick={(e) => {
                e.currentTarget.blur();
                onSidePanelModeChange?.(sidePanelMode === "fixed" ? "autohide" : "fixed");
              }}
            >
              <span className="pin-icon" aria-hidden="true">
                📌
              </span>
              <span className="pin-label">
                {sidePanelMode === "fixed" ? "Pinned" : "Auto-hide"}
              </span>
            </button>
          </div>
          <div className="inspector-stack-content">{inspector}</div>
        </aside>
        <section
          ref={progressionStripRef}
          className="progression-strip"
          role="region"
          aria-label="My Progression"
          onClick={(event) => {
            if (event.target === event.currentTarget) onProgressionBackgroundClick?.();
          }}
        >
          {progression}
        </section>
        <aside
          id="midi-settings-panel"
          ref={midiPanelRef}
          hidden={!midiSettingsOpen}
          className="selected-step-stack midi-settings-sidebar"
          aria-label="Midi Settings"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeMidiSettings();
            }
          }}
        >
          <div className="inspector-dock-header">
            <h2>Midi Settings</h2>
            <button type="button" aria-label="Close Midi Settings" onClick={closeMidiSettings}>
              Close
            </button>
          </div>
          <div id="midi-settings-content" />
        </aside>
        {hasSelectedStep ? (
          <aside
            ref={selectedStepStackRef}
            hidden={midiSettingsOpen}
            className="selected-step-stack"
            aria-label="Selected step"
            tabIndex={-1}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onPointerEnter={handleMouseEnter}
            onPointerLeave={handleMouseLeave}
            onMouseDown={(event) => {
              if (
                event.target instanceof HTMLElement &&
                !event.target.closest("button, input, select, textarea, [tabindex]")
              ) {
                event.currentTarget.focus();
              }
            }}
            style={offsetY > 0 ? { marginTop: `${offsetY}px` } : undefined}
          >
            <div className="selected-step-stack-content">
              {selectedStepQuickEdit}
              {selectedStepInspector}
            </div>
          </aside>
        ) : null}
      </section>
      {sidePanelMode === "autohide" && isCollapsed ? (
        <div
          className="studio-sidebar-hover-sensor"
          aria-hidden="true"
          data-testid="sidebar-hover-sensor"
          onMouseEnter={handleMouseEnter}
          onMouseOver={handleMouseEnter}
          onPointerEnter={handleMouseEnter}
          onClick={handleMouseEnter}
        />
      ) : null}
      {overlays}
      {bottomPanel}
      <footer className="app-status-bar" role="contentinfo" aria-label="Status bar">
        {statusBar}
        <span id="midi-status-content" className="midi-status-compact" />
      </footer>
      {printable}
    </main>
  );
}
