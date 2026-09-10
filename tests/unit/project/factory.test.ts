import { describe, expect, it } from "vitest";
import {
  DEFAULT_PIANO_PERFORMANCE,
  createDefaultProject,
} from "../../../src/domain/project/factory";

describe("project defaults", () => {
  it("uses Humanized articulation for new projects and their new steps", () => {
    const project = createDefaultProject("default-articulation", "Default Articulation");

    expect(DEFAULT_PIANO_PERFORMANCE.articulation).toBe("humanized");
    expect(project.defaults.piano.performance.articulation).toBe("humanized");
  });
});
