import { useEffect, useState, type RefObject } from "react";

interface ArrowCoords {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly path: string;
  readonly midX: number;
  readonly midY: number;
}

export interface MatrixResolutionArrowsProps {
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly sourceFunctionId: string | null | undefined;
  readonly targetFunctionId: string | null | undefined;
  readonly targetSymbol?: string | undefined;
  readonly enabled?: boolean | undefined;
}

export function MatrixResolutionArrows({
  containerRef,
  sourceFunctionId,
  targetFunctionId,
  targetSymbol,
  enabled = true,
}: MatrixResolutionArrowsProps) {
  const [coords, setCoords] = useState<ArrowCoords | null>(null);

  useEffect(() => {
    if (!enabled || !sourceFunctionId || !targetFunctionId) {
      setCoords(null);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const updateCoords = () => {
      const sourceEl = container.querySelector<HTMLElement>(
        `[data-testid="chord-card-${sourceFunctionId}"]`,
      );
      const targetEl = container.querySelector<HTMLElement>(
        `[data-testid="chord-card-${targetFunctionId}"]`,
      );

      if (!sourceEl || !targetEl) {
        setCoords(null);
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const sourceRect = sourceEl.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();

      const isDownward = targetRect.top > sourceRect.top;

      const x1 = sourceRect.left + sourceRect.width / 2 - containerRect.left + container.scrollLeft;
      const y1 = isDownward
        ? sourceRect.bottom - containerRect.top + container.scrollTop
        : sourceRect.top - containerRect.top + container.scrollTop;

      const x2 = targetRect.left + targetRect.width / 2 - containerRect.left + container.scrollLeft;
      const y2 = isDownward
        ? targetRect.top - containerRect.top + container.scrollTop - 6
        : targetRect.bottom - containerRect.top + container.scrollTop + 6;

      const deltaY = y2 - y1;
      const cp1y = y1 + deltaY * 0.5;
      const cp2y = y2 - deltaY * 0.5;

      const path = `M ${x1} ${y1} C ${x1} ${cp1y}, ${x2} ${cp2y}, ${x2} ${y2}`;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      setCoords({ x1, y1, x2, y2, path, midX, midY });
    };

    updateCoords();

    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateCoords) : null;
    observer?.observe(container);
    window.addEventListener("resize", updateCoords);
    container.addEventListener("scroll", updateCoords);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateCoords);
      container.removeEventListener("scroll", updateCoords);
    };
  }, [containerRef, enabled, sourceFunctionId, targetFunctionId]);

  if (!enabled || !coords) return null;

  return (
    <svg
      className="matrix-resolution-arrows-overlay"
      aria-hidden="true"
      data-testid="matrix-resolution-arrows-overlay"
    >
      <defs>
        <marker
          id="matrix-arrowhead"
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--accent-bright, #38bdf8)" />
        </marker>
        <filter id="arrow-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="arrow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f87171" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>

      {/* Glow shadow path */}
      <path
        d={coords.path}
        fill="none"
        stroke="#38bdf8"
        strokeWidth="5"
        strokeOpacity="0.35"
        filter="url(#arrow-glow)"
      />

      {/* Main arrow line */}
      <path
        d={coords.path}
        fill="none"
        stroke="url(#arrow-grad)"
        strokeWidth="2.5"
        strokeDasharray="6 3"
        markerEnd="url(#matrix-arrowhead)"
        className="matrix-arrow-path-animated"
      />

      {/* Middle badge */}
      {targetSymbol ? (
        <g transform={`translate(${coords.midX}, ${coords.midY})`}>
          <rect
            x="-30"
            y="-11"
            width="60"
            height="22"
            rx="11"
            fill="var(--surface-2, #1e293b)"
            stroke="var(--accent-bright, #38bdf8)"
            strokeWidth="1.5"
          />
          <text
            x="0"
            y="4"
            textAnchor="middle"
            fill="var(--text, #f8fafc)"
            fontSize="10"
            fontWeight="bold"
            letterSpacing="0.03em"
          >
            → {targetSymbol}
          </text>
        </g>
      ) : null}
    </svg>
  );
}
