// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { HarmonicMatrix } from "../../../src/ui/matrix/HarmonicMatrix";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

describe("Harmonic Matrix playback highlighting", () => {
  it("highlights the matching matrix card when playingFunctionId is provided", () => {
    const project = createDefaultProject("matrix-playback-test", "Playback Test");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    // Render with playingFunctionId="I"
    act(() => {
      root.render(
        createElement(HarmonicMatrix, {
          project,
          playingFunctionId: "I",
          recommendations: null,
          contextualFunctionIds: [],
          onPreview: () => undefined,
          onAdd: () => undefined,
          onGlobalView: () => undefined,
          onModuleChange: () => undefined,
          onTonicChange: () => undefined,
          onTemplateOpen: () => undefined,
          onTemplateReset: () => undefined,
          onStaffOctaveChange: () => undefined,
        }),
      );
    });

    const playingCardI = container.querySelector('[data-testid="chord-card-I"]');
    expect(playingCardI).not.toBeNull();
    expect(playingCardI?.classList.contains("is-playing")).toBe(true);
    expect(playingCardI?.getAttribute("data-playing")).toBe("true");

    const cardIV = container.querySelector('[data-testid="chord-card-IV"]');
    expect(cardIV?.classList.contains("is-playing")).toBe(false);
    expect(cardIV?.getAttribute("data-playing")).toBeNull();

    // Advance playback to "IV"
    act(() => {
      root.render(
        createElement(HarmonicMatrix, {
          project,
          playingFunctionId: "IV",
          recommendations: null,
          contextualFunctionIds: [],
          onPreview: () => undefined,
          onAdd: () => undefined,
          onGlobalView: () => undefined,
          onModuleChange: () => undefined,
          onTonicChange: () => undefined,
          onTemplateOpen: () => undefined,
          onTemplateReset: () => undefined,
          onStaffOctaveChange: () => undefined,
        }),
      );
    });

    expect(playingCardI?.classList.contains("is-playing")).toBe(false);
    expect(playingCardI?.getAttribute("data-playing")).toBeNull();

    expect(cardIV?.classList.contains("is-playing")).toBe(true);
    expect(cardIV?.getAttribute("data-playing")).toBe("true");

    // Clear playback
    act(() => {
      root.render(
        createElement(HarmonicMatrix, {
          project,
          playingFunctionId: undefined,
          recommendations: null,
          contextualFunctionIds: [],
          onPreview: () => undefined,
          onAdd: () => undefined,
          onGlobalView: () => undefined,
          onModuleChange: () => undefined,
          onTonicChange: () => undefined,
          onTemplateOpen: () => undefined,
          onTemplateReset: () => undefined,
          onStaffOctaveChange: () => undefined,
        }),
      );
    });

    expect(container.querySelectorAll(".chord-card.is-playing").length).toBe(0);

    act(() => root.unmount());
  });
});
