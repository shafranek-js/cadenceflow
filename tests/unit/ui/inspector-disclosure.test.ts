// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import type { RestStep } from "../../../src/domain/progression/step";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import { CardTemplateInspector } from "../../../src/ui/inspector/CardTemplateInspector";
import { InspectorDisclosureToggle } from "../../../src/ui/inspector/InspectorDisclosure";
import { InspectorProgressionSettings } from "../../../src/ui/inspector/InspectorProgressionSettings";
import { ProgressionGlobalInspector } from "../../../src/ui/inspector/ProgressionGlobalInspector";
import { RestStepInspector } from "../../../src/ui/inspector/RestStepInspector";
import { useInspectorDisclosure } from "../../../src/ui/inspector/useInspectorDisclosure";
import { INITIAL_LOOP_STATE } from "../../../src/ui/transport/loopState";

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

function DisclosureHarness({ storageKey }: { readonly storageKey: string }) {
  const { isOpen, toggle } = useInspectorDisclosure(storageKey, true);
  return el(
    "button",
    {
      type: "button",
      "data-testid": "harness-toggle",
      "aria-expanded": isOpen,
      onClick: toggle,
    },
    isOpen ? "open" : "closed",
  );
}

describe("Inspector disclosure abstraction", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the shared toggle as a button with aria-expanded and a rotating chevron", () => {
    const onToggle = vi.fn();
    const mounted = mount(
      el(InspectorDisclosureToggle, {
        isOpen: true,
        onToggle,
        label: "Sound Engines",
        controlsId: "section-body",
        testId: "shared-toggle",
      }),
    );

    const button = mounted.container.querySelector<HTMLButtonElement>(
      '[data-testid="shared-toggle"]',
    );
    expect(button?.tagName).toBe("BUTTON");
    expect(button?.getAttribute("aria-expanded")).toBe("true");
    expect(button?.getAttribute("aria-controls")).toBe("section-body");
    expect(button?.textContent).toContain("Sound Engines");
    expect(
      mounted.container.querySelector(".ui-icon-disclosure")?.classList.contains("is-rotated"),
    ).toBe(true);

    act(() => button?.click());
    expect(onToggle).toHaveBeenCalledTimes(1);

    mounted.rerender(
      el(InspectorDisclosureToggle, {
        isOpen: false,
        onToggle,
        label: "Sound Engines",
        controlsId: "section-body",
        testId: "shared-toggle",
      }),
    );

    expect(button?.getAttribute("aria-expanded")).toBe("false");
    expect(
      mounted.container.querySelector(".ui-icon-disclosure")?.classList.contains("is-rotated"),
    ).toBe(false);

    mounted.unmount();
  });

  it("persists per-section fold state and restores it on the next mount", () => {
    const storageKey = "cadenceflow.ui.test-inspector-disclosure-open";

    const first = mount(el(DisclosureHarness, { storageKey }));
    const firstToggle = first.container.querySelector<HTMLButtonElement>(
      '[data-testid="harness-toggle"]',
    );
    expect(firstToggle?.getAttribute("aria-expanded")).toBe("true");

    act(() => firstToggle?.click());
    expect(firstToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(window.localStorage.getItem(storageKey)).toBe("false");
    first.unmount();

    const second = mount(el(DisclosureHarness, { storageKey }));
    expect(
      second.container
        .querySelector('[data-testid="harness-toggle"]')
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
    second.unmount();
  });

  it("folds the All Cards Template panel and persists the choice", () => {
    const project = createDefaultProject("test", "Test Project");
    const mounted = mount(
      el(CardTemplateInspector, {
        project,
        functionId: null,
        onPerformancePatch: vi.fn(),
        onDurationChange: vi.fn(),
        onReset: vi.fn(),
      }),
    );

    const toggle = mounted.container.querySelector<HTMLButtonElement>(
      '[data-testid="matrix-template-disclosure-btn"]',
    );
    expect(toggle?.tagName).toBe("BUTTON");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(mounted.container.querySelectorAll(".card-template-inspector details").length).toBe(4);

    act(() => toggle?.click());

    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(mounted.container.querySelectorAll(".card-template-inspector details").length).toBe(0);
    expect(window.localStorage.getItem("cadenceflow.ui.card-template-disclosure-open")).toBe(
      "false",
    );
    // The heading stays in the document so the panel keeps its accessible name.
    expect(mounted.container.querySelector("h3")?.textContent).toBe("All Cards Template");

    mounted.unmount();
  });

  it("folds the All Steps & Measures panel and persists the choice", () => {
    const project = createDefaultProject("test", "Test Project");
    const mounted = mount(
      el(ProgressionGlobalInspector, {
        project,
        onBatchPerformanceChange: vi.fn(),
        onBatchDurationChange: vi.fn(),
        onResetAll: vi.fn(),
        onSetProgressionView: vi.fn(),
      }),
    );

    const toggle = mounted.container.querySelector<HTMLButtonElement>(
      '[data-testid="progression-global-disclosure-btn"]',
    );
    expect(toggle?.tagName).toBe("BUTTON");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(mounted.container.querySelector(".progression-view-disclosure")).not.toBeNull();

    act(() => toggle?.click());

    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(mounted.container.querySelector(".progression-view-disclosure")).toBeNull();
    expect(
      window.localStorage.getItem("cadenceflow.ui.progression-global-inspector-disclosure-open"),
    ).toBe("false");
    expect(mounted.container.querySelector("h3")?.textContent).toBe("All Steps & Measures");

    mounted.unmount();
  });

  it("folds the Rest step panel and persists the choice", () => {
    const project = createDefaultProject("test", "Test Project");
    const step: RestStep = {
      id: "rest-1",
      kind: "rest",
      duration: musicalDuration(rational(4, 4)),
    };

    const mounted = mount(
      el(RestStepInspector, {
        step,
        meter: project.globalTiming.meter,
        onDurationChange: vi.fn(),
        onRemove: vi.fn(),
        onMoveLeft: vi.fn(),
        onMoveRight: vi.fn(),
      }),
    );

    const toggle = mounted.container.querySelector<HTMLButtonElement>(
      '[data-testid="rest-step-disclosure-btn"]',
    );
    expect(toggle?.tagName).toBe("BUTTON");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(mounted.container.querySelector(".step-actions")).not.toBeNull();

    act(() => toggle?.click());

    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(mounted.container.querySelector(".step-actions")).toBeNull();
    expect(window.localStorage.getItem("cadenceflow.ui.rest-step-inspector-disclosure-open")).toBe(
      "false",
    );
    // The step inspector region and its heading survive collapsing.
    expect(
      mounted.container.querySelector('[data-testid="step-performance-inspector"]'),
    ).not.toBeNull();
    expect(mounted.container.querySelector("h3")?.textContent).toBe("Rest");

    mounted.unmount();
  });

  it("keeps the Melody Track section inside Progression settings and restores fold state", () => {
    window.localStorage.setItem(
      "cadenceflow.ui.selected-step.progression-settings-disclosure-open",
      "true",
    );
    const project = createDefaultProject("test", "Test Project");
    const mounted = mount(
      el(InspectorProgressionSettings, {
        meter: project.globalTiming.meter,
        onSetMeter: vi.fn(),
        groove: project.groove,
        onSetGroove: vi.fn(),
        loopState: INITIAL_LOOP_STATE,
        steps: project.progression.steps,
        onSetLoopMode: vi.fn(),
        melodyTrack: project.melodyTrack,
        onMelodyTrackSettingsChange: vi.fn(),
        hasMelodyRecipe: true,
      }),
    );

    const settings = mounted.container.querySelector("details.selected-progression-settings");
    expect(settings?.hasAttribute("open")).toBe(true);
    expect(mounted.container.querySelector(".global-meter-disclosure")).not.toBeNull();
    expect(mounted.container.querySelector(".global-groove-disclosure")).not.toBeNull();
    expect(mounted.container.querySelector(".loop-disclosure")).not.toBeNull();

    // Melody Track is its own foldable section rather than a hard-coded-open wrapper.
    expect(mounted.container.querySelector('[aria-label="Melody Track controls"]')).not.toBeNull();
    expect(
      mounted.container.querySelector('[data-testid="melody-track-disclosure-btn"]'),
    ).not.toBeNull();
    expect(mounted.container.querySelectorAll("details.global-tracks-disclosure").length).toBe(0);

    mounted.unmount();
  });
});
