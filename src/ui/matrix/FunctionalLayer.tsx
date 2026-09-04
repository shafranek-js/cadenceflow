import type { ReactNode } from "react";

export function FunctionalLayer({ label, children, expanded }: {
  readonly label: string;
  readonly children: ReactNode;
  readonly expanded?: ReactNode;
}) {
  return (
    <section className="matrix-layer" aria-label={label}>
      <h3>{label}</h3>
      <div className="matrix-layer-cards">{children}</div>
      {expanded ? <div className="matrix-expanded-strip" aria-label={`${label} contextual options`}><span className="expanded-label">Contextual</span>{expanded}</div> : null}
    </section>
  );
}
