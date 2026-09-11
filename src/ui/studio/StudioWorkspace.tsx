import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

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
  const [offsetY, setOffsetY] = useState(0);

  useLayoutEffect(() => {
    if (!selectedStepInspector) {
      setOffsetY(0);
      return;
    }

    const updateOffset = () => {
      const strip = progressionStripRef.current;
      if (!strip) return;

      const selectedMeasure = strip.querySelector<HTMLElement>(
        ".progression-measure-card[data-has-selected-step='true']",
      );
      const targetCard =
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

    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", updateOffset);
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
