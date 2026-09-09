import type { ReactNode } from "react";

export function FunctionalLayer({
  label,
  children,
  expanded,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly expanded?: ReactNode;
}) {
  return (
    <section className="matrix-layer" aria-label={label} data-layer={label}>
      <div className="matrix-layer-heading">
        <h3>{label}</h3>
      </div>
      <div className="matrix-layer-cards">{children}</div>
      {expanded ? (
        <section className="matrix-expanded-strip" aria-label={`${label} contextual options`}>
          <span className="expanded-label">Contextual</span>
          {expanded}
        </section>
      ) : null}
    </section>
  );
}
