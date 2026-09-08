import type { ReactNode } from "react";

export interface StudioWorkspaceProps {
  readonly header: ReactNode;
  readonly transport: ReactNode;
  readonly matrix: ReactNode;
  readonly inspector: ReactNode;
  readonly progression: ReactNode;
  readonly onProgressionBackgroundClick?: () => void;
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
  progression,
  onProgressionBackgroundClick,
  overlays,
}: StudioWorkspaceProps) {
  return (
    <main className="app-shell" aria-label="CadenceFlow Studio">
      <header className="app-header" aria-label="Project and application controls">
        {header}
      </header>
      <section className="studio-transport" aria-label="Transport">
        {transport}
      </section>
      <section className="studio-grid" aria-label="Studio work area">
        <div className="studio-main-column">
          <div className="studio-matrix-area">{matrix}</div>
          <section
            className="progression-strip"
            aria-label="My Progression"
            onClick={(event) => {
              if (event.target === event.currentTarget) onProgressionBackgroundClick?.();
            }}
          >
            {progression}
          </section>
        </div>
        <aside className="inspector-stack" aria-label="Inspector">
          {inspector}
        </aside>
      </section>
      {overlays}
    </main>
  );
}
