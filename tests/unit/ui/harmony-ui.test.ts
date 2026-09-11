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
  it("renders a disabled Piano selector and exposes mute, solo, and volume controls", () => {
    const onChange = vi.fn();
    const mounted = mount(
      el(HarmonyTrackControls, {
        settings: { instrument: "piano", muted: false, solo: false, volume: 100 },
        onChange,
      }),
    );

    expect(
      mounted.container.querySelector('[aria-label="Harmony Track Instrument"]'),
    ).toHaveProperty("disabled", true);
    expect(mounted.container.querySelector('[aria-label="Harmony Track Volume"]')).not.toBeNull();
    expect(mounted.container.querySelector('[aria-label="Mute Harmony Track"]')).not.toBeNull();
    expect(mounted.container.querySelector('[aria-label="Solo Harmony Track"]')).not.toBeNull();

    act(() => {
      (
        mounted.container.querySelector('[aria-label="Mute Harmony Track"]') as HTMLButtonElement
      ).click();
      (
        mounted.container.querySelector('[aria-label="Solo Harmony Track"]') as HTMLButtonElement
      ).click();
    });
    expect(onChange).toHaveBeenNthCalledWith(1, { muted: true });
    expect(onChange).toHaveBeenNthCalledWith(2, { solo: true });
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
});
