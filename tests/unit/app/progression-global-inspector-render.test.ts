import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { createDefaultProject } from "../../../src/domain/project/factory";
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
});
