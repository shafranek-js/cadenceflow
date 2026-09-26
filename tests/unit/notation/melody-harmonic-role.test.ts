import { describe, expect, it } from "vitest";
import { createMelodyTimeline } from "../../../src/notation/melodyStaffProjection";
import { encodePortableProject } from "../../../src/persistence/portableProject";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";

describe("derived harmonic roles in the Melody projection", () => {
  it("adds the exact role pair to projected events without serializing role data", () => {
    const project = createRichProjectFixture();
    const timeline = createMelodyTimeline(project);
    const projected = timeline.events[0];

    expect(projected).toBeDefined();
    expect(projected?.harmonicRole).toMatchObject({
      primary: expect.stringMatching(/^(root|chord-tone|scale-tone|altered)$/),
      targetNext: expect.any(Boolean),
    });
    expect(Object.keys(projected!.harmonicRole).sort()).toEqual(["primary", "targetNext"]);

    const encoded = encodePortableProject(project);
    expect(encoded).not.toContain("harmonicRole");
    expect(encoded).not.toContain("targetNext");
  });
});
