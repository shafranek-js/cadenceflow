import type { ReactNode } from "react";

export interface StudioWorkspaceProps {
  readonly header: ReactNode;
  readonly transport: ReactNode;
  readonly matrix: ReactNode;
  readonly inspector: ReactNode;
  readonly progression: ReactNode;
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
      <div className="studio-grid" aria-label="Studio work area">
        <div className="studio-matrix-area">{matrix}</div>
        <aside className="inspector-stack" aria-label="Inspector">
          {inspector}
        </aside>
      </div>
      <section className="progression-strip" aria-label="My Progression">
        {progression}
      </section>
      {overlays}
    </main>
  );
}
