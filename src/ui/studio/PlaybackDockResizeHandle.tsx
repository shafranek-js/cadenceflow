import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  clampPlaybackDockHeight,
  playbackDockHeightRatioForSize,
  playbackDockSizeRange,
  type PlaybackDockSizeRange,
} from "./playbackDockSizing";

interface PlaybackDockResizeHandleProps {
  readonly panel: "piano" | "guitar";
  readonly label: string;
  readonly preferredHeightRatio: number;
  readonly onPreferredHeightRatioChange: (ratio: number) => void;
}

interface PlaybackDockResizeSnapshot extends PlaybackDockSizeRange {
  readonly height: number;
}

interface PlaybackDockDrag {
  readonly pointerId: number;
  lastY: number;
  height: number;
}

function readShell(element: HTMLElement): HTMLElement | null {
  return element.closest<HTMLElement>(".app-shell");
}

function readPanel(handle: HTMLElement): HTMLElement | null {
  return handle.closest<HTMLElement>(".playback-instrument-panel");
}

function readDockSize(panel: HTMLElement, preferredHeightRatio: number): number {
  const height = panel.getBoundingClientRect().height;
  return height > 0 ? height : preferredHeightRatio * window.innerHeight;
}

function updateSharedDockHeight(shell: HTMLElement): void {
  const dock = shell.querySelector<HTMLElement>(".playback-instrument-dock");
  if (!dock) return;
  let maxHeight = 0;
  for (const panel of dock.querySelectorAll<HTMLElement>(".playback-instrument-panel")) {
    maxHeight = Math.max(maxHeight, panel.getBoundingClientRect().height);
  }
  if (maxHeight > 0) {
    shell.style.setProperty("--playback-instrument-dock-height", `${maxHeight}px`);
  }
}

export function PlaybackDockResizeHandle({
  panel: panelKind,
  label,
  preferredHeightRatio,
  onPreferredHeightRatioChange,
}: PlaybackDockResizeHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null);
  const preferredRatioRef = useRef(preferredHeightRatio);
  const onChangeRef = useRef(onPreferredHeightRatioChange);
  const rangeRef = useRef<PlaybackDockSizeRange>({ min: 0, max: 0 });
  const heightRef = useRef(0);
  const dragRef = useRef<PlaybackDockDrag | null>(null);
  const [snapshot, setSnapshot] = useState<PlaybackDockResizeSnapshot>({
    min: 0,
    max: 0,
    height: 0,
  });

  useEffect(() => {
    preferredRatioRef.current = preferredHeightRatio;
    onChangeRef.current = onPreferredHeightRatioChange;
  }, [onPreferredHeightRatioChange, preferredHeightRatio]);

  const applyHeight = useCallback((height: number, range: PlaybackDockSizeRange) => {
    const handle = handleRef.current;
    const shell = handle ? readShell(handle) : null;
    const panel = handle ? readPanel(handle) : null;
    if (!shell || !panel) return 0;
    const clampedHeight = clampPlaybackDockHeight(height, range);
    panel.style.setProperty("--playback-panel-height", `${clampedHeight}px`);
    heightRef.current = clampedHeight;
    rangeRef.current = range;
    updateSharedDockHeight(shell);
    setSnapshot((current) =>
      current.min === range.min &&
      current.max === range.max &&
      Math.abs(current.height - clampedHeight) < 0.5
        ? current
        : { min: range.min, max: range.max, height: clampedHeight },
    );
    return clampedHeight;
  }, []);

  const refreshBounds = useCallback(() => {
    const handle = handleRef.current;
    const shell = handle ? readShell(handle) : null;
    const panel = handle ? readPanel(handle) : null;
    const workspace = shell?.querySelector<HTMLElement>(".studio-grid");
    const status = shell?.querySelector<HTMLElement>(".app-status-bar");
    if (!shell || !panel || !workspace || !status) return;
    const shellRect = shell.getBoundingClientRect();
    const statusRect = status.getBoundingClientRect();
    const statusTopWithinShell = Math.min(statusRect.top, shellRect.bottom - statusRect.height);
    const range = playbackDockSizeRange(
      workspace.getBoundingClientRect().top,
      statusTopWithinShell,
      window.innerHeight,
    );
    rangeRef.current = range;
    const drag = dragRef.current;
    const requestedHeight = drag
      ? heightRef.current
      : preferredRatioRef.current * window.innerHeight;
    const appliedHeight = applyHeight(requestedHeight, range);
    if (drag) drag.height = appliedHeight;
  }, [applyHeight]);

  useLayoutEffect(() => {
    const handle = handleRef.current;
    const shell = handle ? readShell(handle) : null;
    const workspace = shell?.querySelector<HTMLElement>(".studio-grid");
    const status = shell?.querySelector<HTMLElement>(".app-status-bar");
    const header = shell?.querySelector<HTMLElement>(".app-header");
    const transport = shell?.querySelector<HTMLElement>(".studio-transport");
    const dock = shell?.querySelector<HTMLElement>(".playback-instrument-dock");
    if (!shell || !workspace || !status || !dock) return;

    refreshBounds();
    const observer = new ResizeObserver(() => {
      refreshBounds();
    });
    for (const element of [shell, workspace, status, header, transport]) {
      if (element) observer.observe(element);
    }
    const mutations = new MutationObserver(refreshBounds);
    mutations.observe(dock, { childList: true });
    window.addEventListener("resize", refreshBounds);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", refreshBounds);
    };
  }, [refreshBounds]);

  const commitHeight = useCallback((height: number) => {
    const ratio = playbackDockHeightRatioForSize(height, window.innerHeight);
    preferredRatioRef.current = ratio;
    onChangeRef.current(ratio);
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const handle = event.currentTarget;
    const shell = readShell(handle);
    const panel = readPanel(handle);
    if (!shell || !panel) return;
    const height = readDockSize(panel, preferredRatioRef.current);
    if (rangeRef.current.max <= rangeRef.current.min) return;
    dragRef.current = { pointerId: event.pointerId, lastY: event.clientY, height };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = drag.lastY - event.clientY;
    drag.lastY = event.clientY;
    drag.height = applyHeight(drag.height + delta, rangeRef.current);
  };

  const finishPointerDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    commitHeight(heightRef.current);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = event.currentTarget;
    const range = rangeRef.current;
    if (
      event.key !== "ArrowUp" &&
      event.key !== "ArrowDown" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const delta = event.shiftKey ? 64 : 24;
    const requested =
      event.key === "Home"
        ? range.min
        : event.key === "End"
          ? range.max
          : heightRef.current + (event.key === "ArrowUp" ? delta : -delta);
    const height = applyHeight(requested, range);
    current.setAttribute("aria-valuenow", `${Math.round(height)}`);
    commitHeight(height);
  };

  return (
    <div
      ref={handleRef}
      className="playback-dock-resize-handle"
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      aria-valuemin={Math.round(snapshot.min)}
      aria-valuemax={Math.round(snapshot.max)}
      aria-valuenow={Math.round(snapshot.height)}
      aria-valuetext={`${Math.round(snapshot.height)} pixels tall`}
      tabIndex={0}
      data-playback-follow-ignore="true"
      data-testid={`playback-${panelKind}-resize-handle`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
      onLostPointerCapture={finishPointerDrag}
      onKeyDown={handleKeyDown}
    >
      <span aria-hidden="true" />
    </div>
  );
}
