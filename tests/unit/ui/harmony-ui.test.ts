import { DEFAULT_HARMONY_TRACK_SETTINGS } from "../../../src/domain/harmony/track";
// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { HarmonyTrackControls } from "../../../src/ui/harmony/HarmonyTrackControls";

const el = React.createElement;

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("Harmony Track controls", () => {
  it("renders the Harmony Track instrument picker and exposes mute, solo, and volume controls", () => {
    const onChange = vi.fn();
    const mounted = mount(
      el(HarmonyTrackControls, {
        settings: {
          ...DEFAULT_HARMONY_TRACK_SETTINGS,
          instrument: "piano",
          muted: false,
          solo: false,
          volume: 100,
        },
        onChange,
      }),
    );

    const instrumentSelect = mounted.container.querySelector(
      '[aria-label="Harmony Track Instrument"]',
    ) as HTMLSelectElement;
    expect(instrumentSelect).not.toBeNull();
    expect(instrumentSelect.disabled).toBe(false);
    expect(
      mounted.container.querySelector('[aria-label="Harmony Track Instrument search"]'),
    ).not.toBeNull();
    expect(mounted.container.querySelector('[aria-label="Harmony Track Volume"]')).not.toBeNull();
    expect(mounted.container.querySelector('[aria-label="Mute Harmony Track"]')).not.toBeNull();
    expect(mounted.container.querySelector('[aria-label="Solo Harmony Track"]')).not.toBeNull();

    act(() => {
      instrumentSelect.value = "gm-024";
      instrumentSelect.dispatchEvent(new Event("change", { bubbles: true }));
      (
        mounted.container.querySelector('[aria-label="Mute Harmony Track"]') as HTMLButtonElement
      ).click();
      (
        mounted.container.querySelector('[aria-label="Solo Harmony Track"]') as HTMLButtonElement
      ).click();
    });
    expect(onChange).toHaveBeenNthCalledWith(1, { instrument: "gm-024" });
    expect(onChange).toHaveBeenNthCalledWith(2, { muted: true });
    expect(onChange).toHaveBeenNthCalledWith(3, { solo: true });
    mounted.unmount();
  });

  it("commits a pointer volume drag once", () => {
    const onChange = vi.fn();
    const mounted = mount(
      el(HarmonyTrackControls, {
        settings: {
          ...DEFAULT_HARMONY_TRACK_SETTINGS,
          instrument: "piano",
          muted: false,
          solo: false,
          volume: 100,
        },
        onChange,
      }),
    );
    const volume = mounted.container.querySelector(
      '[aria-label="Harmony Track Volume"]',
    ) as HTMLInputElement;

    act(() => {
      const setNativeValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      volume.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      setNativeValue?.call(volume, "72");
      volume.dispatchEvent(new Event("input", { bubbles: true }));
      setNativeValue?.call(volume, "64");
      volume.dispatchEvent(new Event("input", { bubbles: true }));
      volume.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ volume: 64 });
    mounted.unmount();
  });

  it("keeps engine and tone settings out of the Harmony track controls", () => {
    const mounted = mount(
      el(HarmonyTrackControls, {
        settings: {
          instrument: "piano",
          muted: false,
          solo: false,
          volume: 100,
          pianoEngine: "soundfont",
          pianoSoundfontInstrument: "gm-004",
          guitarEngine: "hq-samples",
          guitarSoundfontInstrument: "gm-025",
        },
        onChange: vi.fn(),
      }),
    );

    expect(mounted.container.querySelector('[data-testid="piano-engine-hq-btn"]')).toBeNull();
    expect(
      mounted.container.querySelector('[data-testid="piano-engine-soundfont-btn"]'),
    ).toBeNull();
    expect(mounted.container.querySelector('[data-testid="guitar-engine-hq-btn"]')).toBeNull();
    expect(
      mounted.container.querySelector('[data-testid="guitar-engine-soundfont-btn"]'),
    ).toBeNull();
    expect(
      mounted.container.querySelector('[data-testid="piano-soundfont-instrument-select"]'),
    ).toBeNull();
    expect(
      mounted.container.querySelector('[data-testid="guitar-soundfont-instrument-select"]'),
    ).toBeNull();
    mounted.unmount();
  });

  it("folds the Harmony Track section through the shared disclosure toggle", () => {
    window.localStorage.clear();
    const mounted = mount(
      el(HarmonyTrackControls, {
        settings: {
          ...DEFAULT_HARMONY_TRACK_SETTINGS,
          instrument: "piano",
          muted: false,
          solo: false,
          volume: 100,
        },
        onChange: vi.fn(),
      }),
    );

    const toggle = mounted.container.querySelector<HTMLButtonElement>(
      '[data-testid="harmony-track-disclosure-btn"]',
    );
    expect(toggle?.tagName).toBe("BUTTON");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(mounted.container.querySelector('[aria-label="Harmony Track Volume"]')).not.toBeNull();

    act(() => toggle?.click());

    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(mounted.container.querySelector('[aria-label="Harmony Track Volume"]')).toBeNull();
    expect(mounted.container.querySelector('[aria-label="Mute Harmony Track"]')).toBeNull();
    expect(
      window.localStorage.getItem("cadenceflow.ui.track-controls-harmony-disclosure-open"),
    ).toBe("false");
    // The collapsed section keeps its accessible region and title.
    expect(mounted.container.querySelector('[aria-label="Harmony Track controls"]')).not.toBeNull();
    expect(mounted.container.textContent).toContain("Harmony Track");

    act(() => toggle?.click());

    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(mounted.container.querySelector('[aria-label="Harmony Track Volume"]')).not.toBeNull();

    mounted.unmount();
    window.localStorage.clear();
  });
});
