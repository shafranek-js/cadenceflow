import { describe, expect, it } from "vitest";
import {
  InvalidProjectNameError,
  MAX_PROJECT_NAME_LENGTH,
  normalizeProjectName,
} from "../../../src/domain/project/name";
import { sanitizePortableProjectFilename } from "../../../src/persistence/portableProject";

describe("Project name and portable filename rules", () => {
  it("trims names and rejects empty or pathological values", () => {
    expect(normalizeProjectName("  My Song  ")).toBe("My Song");
    expect(() => normalizeProjectName("   ")).toThrow(InvalidProjectNameError);
    expect(() => normalizeProjectName("x".repeat(MAX_PROJECT_NAME_LENGTH + 1))).toThrow(
      `cannot exceed ${MAX_PROJECT_NAME_LENGTH}`,
    );
  });

  it("sanitizes presentation filenames without changing project names", () => {
    expect(sanitizePortableProjectFilename("My Progression")).toBe("My Progression.cadenceflow");
    expect(sanitizePortableProjectFilename("bad<name>:?.cadenceflow")).toBe(
      "bad-name---.cadenceflow",
    );
    expect(sanitizePortableProjectFilename("CON")).toBe("Project-CON.cadenceflow");
    expect(sanitizePortableProjectFilename("...  ")).toBe("Untitled Project.cadenceflow");
  });
});
