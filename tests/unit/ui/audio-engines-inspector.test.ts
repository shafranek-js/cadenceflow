// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AudioEnginesInspector,
  AUDIO_ENGINES_DISCLOSURE_STORAGE_KEY,
} from "../../../src/ui/inspector/AudioEnginesInspector";
import type { HarmonyTrackSettings } from "../../../src/domain/harmony/track";

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

const defaultSettings: HarmonyTrackSettings = {
  instrument: "piano",
  volume: 0.8,
  muted: false,
  solo: false,
  pianoEngine: "hq-samples",
  guitarEngine: "hq-samples",
  guitarSoundfontInstrument: "gm-025",
};

describe("AudioEnginesInspector", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders with Piano: HQ Grand active badge in standard matrix view", () => {
    const onChange = vi.fn();
    const mounted = mount(
      el(AudioEnginesInspector, {
        settings: defaultSettings,
        onChange,
        globalMatrixCardView: "harmonic",
        progressionView: "harmonic",
      }),
    );

    const badge = mounted.container.querySelector('[data-testid="audio-engine-active-badge"]');
    expect(badge?.textContent).toBe("Piano: HQ Grand");

    const pianoHqBtn = mounted.container.querySelector('[data-testid="inspector-piano-engine-hq-btn"]');
    expect(pianoHqBtn?.getAttribute("aria-checked")).toBe("true");

    const pianoSfBtn = mounted.container.querySelector('[data-testid="inspector-piano-engine-soundfont-btn"]');
    expect(pianoSfBtn?.getAttribute("aria-checked")).toBe("false");

    mounted.unmount();
  });

  it("renders with Guitar active badge when guitar view is active", () => {
    const onChange = vi.fn();
    const mounted = mount(
      el(AudioEnginesInspector, {
        settings: { ...defaultSettings, guitarEngine: "hq-samples" },
        onChange,
        globalMatrixCardView: "guitar",
      }),
    );

    const badge = mounted.container.querySelector('[data-testid="audio-engine-active-badge"]');
    expect(badge?.textContent).toBe("Guitar: HQ Acoustic");

    mounted.rerender(
      el(AudioEnginesInspector, {
        settings: {
          ...defaultSettings,
          guitarEngine: "soundfont",
          guitarSoundfontInstrument: "gm-025",
        },
        onChange,
        globalMatrixCardView: "guitar",
      }),
    );

    const updatedBadge = mounted.container.querySelector('[data-testid="audio-engine-active-badge"]');
    expect(updatedBadge?.textContent).toBe("Guitar: SoundFont");

    mounted.unmount();
  });

  it("calls onChange when toggling piano engine", () => {
    const onChange = vi.fn();
    const mounted = mount(
      el(AudioEnginesInspector, {
        settings: defaultSettings,
        onChange,
      }),
    );

    const soundfontBtn = mounted.container.querySelector<HTMLButtonElement>(
      '[data-testid="inspector-piano-engine-soundfont-btn"]',
    );
    expect(soundfontBtn).not.toBeNull();

    act(() => {
      soundfontBtn?.click();
    });

    expect(onChange).toHaveBeenCalledWith({ pianoEngine: "soundfont" });
    mounted.unmount();
  });

  it("calls onChange when toggling guitar engine and changing guitar tone", () => {
    const onChange = vi.fn();
    const mounted = mount(
      el(AudioEnginesInspector, {
        settings: {
          ...defaultSettings,
          guitarEngine: "soundfont",
          guitarSoundfontInstrument: "gm-025",
        },
        onChange,
        globalMatrixCardView: "guitar",
      }),
    );

    const toneSelect = mounted.container.querySelector<HTMLSelectElement>(
      '[data-testid="inspector-guitar-soundfont-select"]',
    );
    expect(toneSelect).not.toBeNull();
    expect(toneSelect?.value).toBe("gm-025");

    act(() => {
      if (toneSelect) {
        toneSelect.value = "gm-024";
        toneSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    expect(onChange).toHaveBeenCalledWith({ guitarSoundfontInstrument: "gm-024" });

    const hqGuitarBtn = mounted.container.querySelector<HTMLButtonElement>(
      '[data-testid="inspector-guitar-engine-hq-btn"]',
    );
    act(() => {
      hqGuitarBtn?.click();
    });
    expect(onChange).toHaveBeenCalledWith({ guitarEngine: "hq-samples" });

    mounted.unmount();
  });

  it("collapses and expands content and persists state to localStorage", () => {
    const onChange = vi.fn();
    const mounted = mount(
      el(AudioEnginesInspector, {
        settings: defaultSettings,
        onChange,
      }),
    );

    const disclosureBtn = mounted.container.querySelector<HTMLButtonElement>(
      '[data-testid="audio-engines-disclosure-btn"]',
    );
    expect(disclosureBtn?.getAttribute("aria-expanded")).toBe("true");
    expect(mounted.container.querySelector('[data-testid="piano-engine-block"]')).not.toBeNull();

    // Click to collapse
    act(() => {
      disclosureBtn?.click();
    });

    expect(disclosureBtn?.getAttribute("aria-expanded")).toBe("false");
    expect(mounted.container.querySelector('[data-testid="piano-engine-block"]')).toBeNull();
    expect(window.localStorage.getItem(AUDIO_ENGINES_DISCLOSURE_STORAGE_KEY)).toBe("false");

    // Click to expand again
    act(() => {
      disclosureBtn?.click();
    });

    expect(disclosureBtn?.getAttribute("aria-expanded")).toBe("true");
    expect(mounted.container.querySelector('[data-testid="piano-engine-block"]')).not.toBeNull();
    expect(window.localStorage.getItem(AUDIO_ENGINES_DISCLOSURE_STORAGE_KEY)).toBe("true");

    mounted.unmount();
  });
});
