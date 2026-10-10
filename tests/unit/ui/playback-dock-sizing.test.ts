import { describe, expect, it } from "vitest";
import {
  clampPlaybackDockHeight,
  DEFAULT_PLAYBACK_DOCK_HEIGHT_RATIO,
  DEFAULT_PLAYBACK_PIANO_DOCK_HEIGHT_RATIO,
  normalizePlaybackDockHeightRatio,
  playbackDockHeightRatioForSize,
  playbackDockSizeRange,
  playbackFretboardSvgSize,
} from "../../../src/ui/studio/playbackDockSizing";

describe("playback dock sizing", () => {
  it("reserves a usable workspace and adapts the minimum dock to scarce space", () => {
    expect(playbackDockSizeRange(120, 350, 900)).toEqual({ min: 80, max: 110 });
    expect(playbackDockSizeRange(120, 270, 900)).toEqual({ min: 30, max: 30 });
  });

  it("bounds preferred panel ratios and resizing to viewport-aware limits", () => {
    expect(playbackDockSizeRange(100, 1800, 2000)).toEqual({ min: 160, max: 1500 });
    expect(playbackDockSizeRange(100, 340, 900)).toEqual({ min: 80, max: 120 });
    expect(playbackDockSizeRange(100, 175, 900)).toEqual({ min: 0, max: 0 });
  });

  it("clamps requested dock heights to the available range", () => {
    const range = playbackDockSizeRange(100, 320, 900);
    expect(clampPlaybackDockHeight(40, range)).toBe(80);
    expect(clampPlaybackDockHeight(180, range)).toBe(100);
    expect(clampPlaybackDockHeight(Number.NaN, range)).toBe(80);
  });

  it("defaults invalid local ratios and preserves a user-selected fraction", () => {
    expect(DEFAULT_PLAYBACK_DOCK_HEIGHT_RATIO).toBeCloseTo(1 / 3);
    expect(DEFAULT_PLAYBACK_PIANO_DOCK_HEIGHT_RATIO).toBeCloseTo(0.13);
    expect(normalizePlaybackDockHeightRatio(undefined)).toBeCloseTo(1 / 3);
    expect(normalizePlaybackDockHeightRatio(Number.POSITIVE_INFINITY)).toBeCloseTo(1 / 3);
    expect(normalizePlaybackDockHeightRatio(0.42)).toBe(0.42);
    expect(playbackDockHeightRatioForSize(378, 900)).toBeCloseTo(0.42);
  });

  it("scales the complete fretboard from its drawing height with proportional geometry", () => {
    const size = playbackFretboardSvgSize(198)!;
    expect(size.scale).toBeCloseTo(1.5);
    expect(size.width).toBeCloseTo(1140);
    expect(size.height).toBeCloseTo(198);
    expect(size.width / size.height).toBeCloseTo(760 / 132);
  });

  it("does not derive SVG geometry from collapsed containers", () => {
    expect(playbackFretboardSvgSize(0)).toBeNull();
    expect(playbackFretboardSvgSize(Number.NaN)).toBeNull();
  });
});
