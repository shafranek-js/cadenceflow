import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

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
  readonly selectedStepInspector?: ReactNode;
  readonly progression: ReactNode;
  readonly statusBar?: ReactNode;
  readonly onProgressionBackgroundClick?: () => void;
  readonly onMatrixBackgroundClick?: () => void;
  readonly overlays?: ReactNode;
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
  selectedStepInspector,
  progression,
  statusBar,
  onProgressionBackgroundClick,
  onMatrixBackgroundClick,
  overlays,
}: StudioWorkspaceProps) {
  const progressionStripRef = useRef<HTMLElement>(null);
  const staffAnchorRef = useRef<StaffAnchor | null>(null);
  const [offsetY, setOffsetY] = useState(0);

  useLayoutEffect(() => {
    if (!selectedStepInspector) {
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
      const calculatedOffset = Math.max(0, Math.round(targetRect.top - stripRect.top));
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
  }, [selectedStepInspector, progression]);

  return (
    <main className="app-shell" aria-label="CadenceFlow Studio">
      <header className="app-header" aria-label="Project and application controls">
        {header}
      </header>
      <section className="studio-transport" aria-label="Transport">
        {transport}
      </section>
      <section
        className={`studio-grid${selectedStepInspector ? " has-selected-step" : ""}`}
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
        <aside className="inspector-stack" aria-label="Inspector">
          {inspector}
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
        {selectedStepInspector ? (
          <aside
            className="selected-step-stack"
            aria-label="Selected step"
            tabIndex={-1}
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
            {selectedStepInspector}
          </aside>
        ) : null}
      </section>
      {overlays}
      <footer className="app-status-bar" role="contentinfo" aria-label="Status bar">
        {statusBar}
      </footer>
    </main>
  );
}
