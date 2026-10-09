import { describe, expect, it } from "vitest";
import {
  applyChordPropertiesEdit,
  resetChordProperties,
} from "../../../src/domain/progression/chordProperties";
import type { ChordStep } from "../../../src/domain/progression/step";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../../src/persistence/portableProject";

describe("T217 portable Chord Properties state", () => {
  it("round-trips borrowed provenance, reset baseline, high inversions, and branch origins", () => {
    const source = createRichProjectFixture();
    const sourceStep = source.progression.steps[0] as ChordStep;
    const borrowed = applyChordPropertiesEdit(sourceStep, source.tonic, source.activeModule, {
      type: "borrow",
      mode: "aeolian",
    });
    const extended = applyChordPropertiesEdit(borrowed, source.tonic, source.activeModule, {
      type: "type",
      value: "13",
    });
    const inverted = applyChordPropertiesEdit(extended, source.tonic, source.activeModule, {
      type: "inversion",
      value: 6,
    });

    const branchSource = source.temporaryBranch!.steps[0] as ChordStep;
    const branchSecondary = applyChordPropertiesEdit(
      branchSource,
      source.tonic,
      source.activeModule,
      { type: "secondary", kind: "dominant", targetFunctionId: "vi" },
    );
    const project = {
      ...source,
      progression: {
        ...source.progression,
        steps: [inverted, ...source.progression.steps.slice(1)],
      },
      temporaryBranch: {
        ...source.temporaryBranch!,
        steps: [branchSecondary, ...source.temporaryBranch!.steps.slice(1)],
      },
    };

    const restored = decodePortableProject(encodePortableProject(project));
    const restoredMain = restored.progression.steps[0] as ChordStep;
    const restoredBranch = restored.temporaryBranch!.steps[0] as ChordStep;

    expect(restored.schemaVersion).toBe(11);
    expect(restoredMain.harmonicFunction).toMatchObject({
      borrowedFromMode: "aeolian",
      borrowedDegree: 1,
    });
    expect(restoredMain.harmonicVariant.extensions).toEqual([9, 11, 13]);
    expect(restoredMain.performance.inversion).toBe(6);
    expect(restoredMain.performance.bass.choice).toBe("thirteenth");
    expect(restoredMain.chordPropertiesOrigin).toEqual(inverted.chordPropertiesOrigin);
    expect(restoredBranch.harmonicFunction.functionId).toBe("V7/vi");
    expect(restoredBranch.chordPropertiesOrigin).toEqual(branchSecondary.chordPropertiesOrigin);

    const reset = resetChordProperties(restoredMain);
    expect(reset.harmonicFunction).toEqual(sourceStep.harmonicFunction);
    expect(reset.harmonicVariant).toEqual(sourceStep.harmonicVariant);
  });
});
