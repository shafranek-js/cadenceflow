export const DEFAULT_PLAYBACK_DOCK_HEIGHT_RATIO = 1 / 3;
export const DEFAULT_PLAYBACK_PIANO_DOCK_HEIGHT_RATIO = 0.13;
export const MIN_PLAYBACK_DOCK_HEIGHT_RATIO = 0.08;
export const MAX_PLAYBACK_DOCK_HEIGHT_RATIO = 0.75;
export const MIN_PLAYBACK_DOCK_HEIGHT = 80;
export const MIN_PLAYBACK_WORKSPACE_HEIGHT = 120;
export const PLAYBACK_FRETBOARD_VIEWBOX_WIDTH = 760;
export const PLAYBACK_FRETBOARD_VIEWBOX_HEIGHT = 132;

export interface PlaybackDockSizeRange {
  readonly min: number;
  readonly max: number;
}

export interface PlaybackFretboardSvgSize {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

export function normalizePlaybackDockHeightRatio(
  value: unknown,
  fallback = DEFAULT_PLAYBACK_DOCK_HEIGHT_RATIO,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < MIN_PLAYBACK_DOCK_HEIGHT_RATIO ||
    value > MAX_PLAYBACK_DOCK_HEIGHT_RATIO
  ) {
    return fallback;
  }
  return value;
}

export function playbackDockHeightRatioForSize(height: number, viewportHeight: number): number {
  if (!Number.isFinite(height) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return DEFAULT_PLAYBACK_DOCK_HEIGHT_RATIO;
  }
  const ratio = height / viewportHeight;
  return Math.min(MAX_PLAYBACK_DOCK_HEIGHT_RATIO, Math.max(MIN_PLAYBACK_DOCK_HEIGHT_RATIO, ratio));
}

export function playbackDockSizeRange(
  workspaceTop: number,
  statusTop: number,
  viewportHeight: number,
): PlaybackDockSizeRange {
  const feasibleMax = Math.max(
    0,
    Math.floor(statusTop - workspaceTop - MIN_PLAYBACK_WORKSPACE_HEIGHT),
  );
  const max = Math.min(feasibleMax, Math.floor(viewportHeight * MAX_PLAYBACK_DOCK_HEIGHT_RATIO));
  const requestedMin = Math.max(
    MIN_PLAYBACK_DOCK_HEIGHT,
    Math.ceil(viewportHeight * MIN_PLAYBACK_DOCK_HEIGHT_RATIO),
  );
  const min = Math.min(max, requestedMin);
  return { min, max };
}

export function clampPlaybackDockHeight(height: number, range: PlaybackDockSizeRange): number {
  const finiteHeight = Number.isFinite(height) ? height : range.min;
  return Math.min(range.max, Math.max(range.min, finiteHeight));
}

export function playbackFretboardSvgSize(availableHeight: number): PlaybackFretboardSvgSize | null {
  if (!Number.isFinite(availableHeight) || availableHeight <= 0) {
    return null;
  }
  // Scale to the panel's actual vertical drawing area. A narrow column can scroll sideways rather
  // than making every string, marker, and note label shrink to an unreadable size.
  const scale = availableHeight / PLAYBACK_FRETBOARD_VIEWBOX_HEIGHT;
  return {
    width: PLAYBACK_FRETBOARD_VIEWBOX_WIDTH * scale,
    height: PLAYBACK_FRETBOARD_VIEWBOX_HEIGHT * scale,
    scale,
  };
}
