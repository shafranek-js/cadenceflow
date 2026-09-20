import type { ReactNode } from "react";
import type { MatrixZoneInfo } from "../../domain/harmony/tendencyArrows";

export function FunctionalLayer({
  label,
  zoneLabel,
  children,
  sidecar,
  zone,
}: {
  readonly label: string;
  readonly zoneLabel?: string;
  readonly children: ReactNode;
  readonly sidecar?:
    | {
        readonly children: ReactNode;
        readonly label: string;
        readonly testId: string;
      }
    | undefined;
  readonly zone?: MatrixZoneInfo;
}) {
  const visibleLabel = zoneLabel ?? label;
  return (
    <section
      className={`matrix-layer ${zone ? `matrix-layer-${zone.id}` : ""}`.trim()}
      aria-label={visibleLabel}
      data-layer={label}
      data-zone-label={visibleLabel}
      data-zone={zone?.id}
    >
      <div className="matrix-layer-heading">
        <div className="matrix-layer-title-group">
          <h3>{visibleLabel}</h3>
          {zoneLabel ? <span className="matrix-layer-detail">{label}</span> : null}
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
      <div className="matrix-layer-cards">
        {children}
        {sidecar ? (
          <section
            className="matrix-sidecar"
            role="group"
            aria-label={sidecar.label}
            data-testid={sidecar.testId}
          >
            <span className="matrix-sidecar-label">{sidecar.label}</span>
            <div className="matrix-sidecar-card">{sidecar.children}</div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
