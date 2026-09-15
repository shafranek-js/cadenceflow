import type { ReactNode } from "react";
import type { MatrixZoneInfo } from "../../domain/harmony/tendencyArrows";

export function FunctionalLayer({
  label,
  children,
  expanded,
  zone,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly expanded?: ReactNode;
  readonly zone?: MatrixZoneInfo;
}) {
  return (
    <section
      className={`matrix-layer ${zone ? `matrix-layer-${zone.id}` : ""}`.trim()}
      aria-label={label}
      data-layer={label}
      data-zone={zone?.id}
    >
      <div className="matrix-layer-heading">
        <div className="matrix-layer-title-group">
          <h3>{label}</h3>
          {zone ? (
            <span
              className={`matrix-zone-badge matrix-zone-${zone.id}`}
              title={`${zone.badge} (${zone.symbol}) — ${zone.tooltip}`}
              aria-label={`${zone.badge}: ${zone.tooltip}`}
              data-testid={`matrix-zone-badge-${zone.id}`}
            >
              <span className="matrix-zone-symbol" aria-hidden="true">
                {zone.symbol}
              </span>
              <span className="matrix-zone-name">{zone.badge}</span>
            </span>
          ) : null}
        </div>
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
