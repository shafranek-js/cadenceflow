import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { migrateProjectData } from "../../../src/domain/project/migrations";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../../src/persistence/portableProject";
import {
  backfillPresentationDefaults,
  DEFAULT_PRESENTATION_STATE,
} from "../../../src/domain/project/presentationDefaults";

/**
 * The project schema validates the *migrated* payload, so anything the schema requires must be
 * present after migration — not merely tolerated by the decoder.
 *
 * Regression context: the schema was tightened so `presentation` rejects unknown keys and
 * requires its non-optional members. That immediately broke every file written before those keys
 * existed: v1–v5 were rejected with "must have required property 'expertiseMode'". The v8→v9
 * migration now backfills the defaults, filling only the gaps, so legacy projects keep opening
 * and explicit user preferences are preserved.
 */

const canonical = () =>
  JSON.parse(encodePortableProject(createDefaultProject("p", "P", "2026-01-01T00:00:00.000Z")));

describe("project schema tightening", () => {
  it("requires the non-optional presentation members", () => {
    const project = createDefaultProject("p", "P", "2026-01-01T00:00:00.000Z");
    const encoded = JSON.stringify(project);
    expect(encoded.length).toBeGreaterThan(0);

    const migrated = migrateProjectData(canonical());
    const presentation = migrated["presentation"] as Record<string, unknown>;
    // The schema requires exactly these; a migration that dropped one would reject the file.
    for (const key of [
      "expertiseMode",
      "theme",
      "globalMatrixCardView",
      "showBassInStaff",
      "noteColorMode",
    ]) {
      expect(presentation[key], `presentation.${key} must survive migration`).toBeDefined();
    }
    // `progressionView` and `measuresPerSystem` are intentionally NOT backfilled: the decoder
    // derives them from genuine legacy data (the Steps' own cardViews and the old
    // `measureLayoutColumns` alias) and only does so when the key is absent. Injecting a default
    // here would discard that information, so the schema leaves both optional.
    expect(presentation["progressionView"]).toBeDefined();
    expect(presentation["measuresPerSystem"]).toBeDefined();
  });

  it("opens projects from every historical schema version", () => {
    const base = canonical();
    // Presentation blocks as they realistically appeared at each version: older files simply did
    // not contain the newer keys.
    const legacyPresentation = (version: number): Record<string, unknown> => {
      if (version <= 2) return { noteColorMode: "standard", progressionView: "harmonic" };
      if (version <= 5) {
        return {
          expertiseMode: "composer",
          theme: "dark",
          progressionView: "harmonic",
          noteColorMode: "standard",
          guitarChordColorMode: "chord-roles",
        };
      }
      return {
        expertiseMode: "composer",
        theme: "dark",
        globalMatrixCardView: "harmonic",
        progressionView: "staff",
        measuresPerSystem: "auto",
        showBassInStaff: true,
        noteColorMode: "suzuki",
        guitarChordColorMode: "fingering",
      };
    };

    for (let version = 1; version <= 10; version++) {
      const doc = { ...base, schemaVersion: version, presentation: legacyPresentation(version) };
      expect(
        () => decodePortableProject(JSON.stringify(doc)),
        `schemaVersion ${version} must still open`,
      ).not.toThrow();
    }
  });

  it("backfills missing presentation keys without overwriting explicit ones", () => {
    const migrated = migrateProjectData({
      ...canonical(),
      schemaVersion: 8,
      presentation: { noteColorMode: "suzuki", progressionView: "staff", theme: "light" },
    });

    const presentation = migrated["presentation"] as Record<string, unknown>;
    // Explicit user choices survive, including the two the decoder would otherwise derive.
    expect(presentation["noteColorMode"]).toBe("suzuki");
    expect(presentation["progressionView"]).toBe("staff");
    expect(presentation["theme"]).toBe("light");
    // Gaps are filled from the canonical defaults.
    expect(presentation["expertiseMode"]).toBe(DEFAULT_PRESENTATION_STATE.expertiseMode);
    expect(presentation["showBassInStaff"]).toBe(DEFAULT_PRESENTATION_STATE.showBassInStaff);
    // Exactly the backfilled defaults plus the preserved explicit keys — and deliberately without
    // `measuresPerSystem`, which has a legacy alias the decoder reads when the key is absent.
    const backfilled = backfillPresentationDefaults();
    const expectedKeys = new Set([...Object.keys(backfilled), ...Object.keys(presentation)]);
    expect(Object.keys(presentation).sort()).toEqual([...expectedKeys].sort());
    expect(presentation["measuresPerSystem"]).toBeUndefined();
  });

  it("rejects an unknown presentation key", () => {
    const doc = canonical();
    doc.presentation.bogusField = "x";
    expect(() => decodePortableProject(JSON.stringify(doc))).toThrow(/additional properties/);
  });

  it("rejects a loop region missing either anchor", () => {
    // Such a region reached validateLoopRegion and threw RangeError during playback.
    const doc = canonical();
    doc.progression.loopRegion = {};
    expect(() => decodePortableProject(JSON.stringify(doc))).toThrow(/loopRegion/);

    const halfSpecified = canonical();
    halfSpecified.progression.loopRegion = { startStepId: "a" };
    expect(() => decodePortableProject(JSON.stringify(halfSpecified))).toThrow(/loopRegion/);
  });

  it("accepts a well-formed loop region", () => {
    const doc = canonical();
    doc.progression.loopRegion = { startStepId: "a", endStepId: "b" };
    const project = decodePortableProject(JSON.stringify(doc));
    expect(project.progression.loopRegion).toEqual({ startStepId: "a", endStepId: "b" });
  });
});
