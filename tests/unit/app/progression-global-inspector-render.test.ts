import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import { ProgressionGlobalInspector } from "../../../src/ui/inspector/ProgressionGlobalInspector";

describe("ProgressionGlobalInspector render test", () => {
  it("renders without crashing on default project", () => {
    const project = createDefaultProject("test", "Test Project");
    const html = renderToString(
      React.createElement(ProgressionGlobalInspector, {
        project,
        onBatchPerformanceChange: () => {},
        onBatchDurationChange: () => {},
        onResetAll: () => {},
        onSetProgressionView: () => {},
        onSetMeasuresPerSystem: () => {},
      }),
    );
    expect(html).toContain("All Steps &amp; Measures");
    expect(html).toContain('data-testid="progression-global-inspector"');
  });

  it("renders Presets section when callbacks are provided", () => {
    const project = createDefaultProject("test", "Test Project");
    const html = renderToString(
      React.createElement(ProgressionGlobalInspector, {
        project,
        onBatchPerformanceChange: () => {},
        onBatchDurationChange: () => {},
        onResetAll: () => {},
        onSetProgressionView: () => {},
        onSetMeasuresPerSystem: () => {},
        onOpenPresets: () => {},
        onSaveAsPreset: () => {},
      }),
    );
    expect(html).toContain("Presets");
    expect(html).toContain('data-testid="progression-presets-btn"');
    expect(html).toContain('data-testid="progression-save-preset-btn"');
  });

  it("renders the project-level independent bass voice toggle in Tracks & audio mixer", () => {
    const project = createRichProjectFixture();
    const html = renderToString(
      React.createElement(ProgressionGlobalInspector, {
        project: { ...project, independentBassEnabled: false },
        onBatchPerformanceChange: () => {},
        onBatchDurationChange: () => {},
        onResetAll: () => {},
        onHarmonyTrackSettingsChange: () => {},
        onSetIndependentBassEnabled: () => {},
      }),
    );

    const tracksDisclosure = html.match(
      /<details class="inspector-disclosure global-tracks-disclosure"[^>]*>([\s\S]*?)<\/details>/,
    )?.[1];
    expect(tracksDisclosure).toContain('data-testid="independent-bass-toggle"');
    expect((html.match(/data-testid="independent-bass-toggle"/g) ?? []).length).toBe(1);
    expect(html).toContain("Independent bass voice");
    expect(html).toContain('aria-label="Independent bass voice"');
  });
});
