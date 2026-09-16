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
        settings: { instrument: "piano", muted: false, solo: false, volume: 100 },
        onChange,
      }),
    );

    const instrumentSelect = mounted.container.querySelector(
      '[aria-label="Harmony Track Instrument"]',
    ) as HTMLSelectElement;
    expect(instrumentSelect).not.toBeNull();
    expect(instrumentSelect.disabled).toBe(false);
    expect(mounted.container.querySelector('[aria-label="Harmony Track Instrument search"]')).not.toBeNull();
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
        settings: { instrument: "piano", muted: false, solo: false, volume: 100 },
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

  it("toggles Piano and Guitar audio engines and selects guitar soundfont tone", () => {
    const onChange = vi.fn();
    const mounted = mount(
      el(HarmonyTrackControls, {
        settings: {
          instrument: "piano",
          muted: false,
          solo: false,
          volume: 100,
          pianoEngine: "hq-samples",
          guitarEngine: "soundfont",
          guitarSoundfontInstrument: "gm-025",
        },
        onChange,
      }),
    );

    const pianoSoundfontBtn = mounted.container.querySelector(
      '[data-testid="piano-engine-soundfont-btn"]',
    ) as HTMLButtonElement;
    const guitarHqBtn = mounted.container.querySelector(
      '[data-testid="guitar-engine-hq-btn"]',
    ) as HTMLButtonElement;
    const guitarToneSelect = mounted.container.querySelector(
      '[data-testid="guitar-soundfont-instrument-select"]',
    ) as HTMLSelectElement;

    expect(pianoSoundfontBtn).not.toBeNull();
    expect(guitarHqBtn).not.toBeNull();
    expect(guitarToneSelect).not.toBeNull();
    expect(guitarToneSelect.value).toBe("gm-025");

    act(() => {
      pianoSoundfontBtn.click();
      guitarHqBtn.click();
      guitarToneSelect.value = "gm-024";
      guitarToneSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onChange).toHaveBeenNthCalledWith(1, { pianoEngine: "soundfont" });
    expect(onChange).toHaveBeenNthCalledWith(2, { guitarEngine: "hq-samples" });
    expect(onChange).toHaveBeenNthCalledWith(3, { guitarSoundfontInstrument: "gm-024" });
    mounted.unmount();
  });
});
