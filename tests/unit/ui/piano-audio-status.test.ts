// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PianoAudioStatus } from "../../../src/ui/header/PianoAudioStatus";

const el = React.createElement;

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return {
    container,
    rerender(nextElement: React.ReactElement) {
      act(() => root.render(nextElement));
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("PianoAudioStatus component", () => {
  it("renders piano audio status labels correctly by default", () => {
    const htmlReady = renderToString(el(PianoAudioStatus, { state: "ready" }));
    expect(htmlReady).toContain("Piano Audio: HQ Piano Ready");
    expect(htmlReady).toContain('data-status="ready"');
    expect(htmlReady).toContain('data-instrument="piano"');

    const htmlLoading = renderToString(el(PianoAudioStatus, { state: "loading" }));
    expect(htmlLoading).toContain("Piano Audio: Loading HQ Piano...");

    const htmlError = renderToString(el(PianoAudioStatus, { state: "error" }));
    expect(htmlError).toContain("Piano Audio: Audio Unavailable");
  });

  it("renders guitar audio status labels when instrument='guitar'", () => {
    const htmlReady = renderToString(
      el(PianoAudioStatus, { state: "ready", instrument: "guitar" }),
    );
    expect(htmlReady).toContain("Guitar Audio: HQ Guitar Ready");
    expect(htmlReady).toContain('data-status="ready"');
    expect(htmlReady).toContain('data-instrument="guitar"');

    const htmlLoading = renderToString(
      el(PianoAudioStatus, { state: "loading", instrument: "guitar" }),
    );
    expect(htmlLoading).toContain("Guitar Audio: Loading HQ Guitar...");

    const htmlError = renderToString(
      el(PianoAudioStatus, { state: "error", instrument: "guitar" }),
    );
    expect(htmlError).toContain("Guitar Audio: Guitar Unavailable");

    const htmlFallback = renderToString(
      el(PianoAudioStatus, { state: "fallback", instrument: "guitar" }),
    );
    expect(htmlFallback).toContain("Guitar Audio: Guitar Fallback");
  });

  it("renders soundfont audio status labels when engine='soundfont'", () => {
    const htmlPiano = renderToString(
      el(PianoAudioStatus, { state: "ready", instrument: "piano", engine: "soundfont" }),
    );
    expect(htmlPiano).toContain("Piano Audio: SoundFont Piano Ready");
    expect(htmlPiano).toContain('data-engine="soundfont"');

    const htmlGuitar = renderToString(
      el(PianoAudioStatus, { state: "ready", instrument: "guitar", engine: "soundfont" }),
    );
    expect(htmlGuitar).toContain("Guitar Audio: SoundFont Guitar Ready");
    expect(htmlGuitar).toContain('data-engine="soundfont"');
  });

  describe("read-only status behavior", () => {
    it("does not expose an engine settings popover", () => {
      const mounted = mount(
        el(PianoAudioStatus, {
          state: "ready",
          instrument: "piano",
          engine: "hq-samples",
        }),
      );

      const statusPill = mounted.container.querySelector<HTMLDivElement>(
        '[data-testid="piano-audio-status"]',
      );
      expect(statusPill?.getAttribute("role")).toBe("status");
      expect(statusPill?.getAttribute("tabindex")).toBeNull();
      expect(statusPill?.getAttribute("aria-haspopup")).toBeNull();
      expect(statusPill?.getAttribute("aria-label")).not.toContain("click to switch");
      expect(mounted.container.querySelector('[data-testid="audio-status-popover"]')).toBeNull();
      expect(mounted.container.querySelector("button")).toBeNull();

      act(() => statusPill?.click());
      expect(mounted.container.querySelector('[data-testid="audio-status-popover"]')).toBeNull();
      mounted.unmount();
    });

    it("exposes retry inline for error and fallback states", () => {
      const onRetry = vi.fn();
      const mounted = mount(
        el(PianoAudioStatus, {
          state: "error",
          onRetry,
        }),
      );

      const statusPill = mounted.container.querySelector<HTMLDivElement>(
        '[data-testid="piano-audio-status"]',
      );
      const retryBtn = mounted.container.querySelector<HTMLButtonElement>(
        '[data-testid="audio-status-retry-btn"]',
      );
      expect(statusPill?.getAttribute("role")).toBe("status");
      expect(retryBtn).not.toBeNull();

      act(() => retryBtn?.click());
      expect(onRetry).toHaveBeenCalledTimes(1);
      mounted.unmount();
    });
  });
});
