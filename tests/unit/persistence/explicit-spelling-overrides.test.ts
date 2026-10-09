import { describe, expect, it } from "vitest";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../../src/persistence/portableProject";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import type { Project } from "../../../src/domain/project/project";
import type { PitchSpelling } from "../../../src/domain/harmony/pitch";

/**
 * Regression tests for saved-spelling overrides surviving a save/load round-trip.
 *
 * Regression context: `explicitSpellingOverrides` was declared on `ChordStep`, accepted by
 * the project JSON schema, and consumed by both MusicXML projection
 * (`pitchWithSavedSpelling`) and the melody timeline (`applySavedMelodySpelling`) — but it
 * was written by neither `encodeStep` nor `decodeStep`. A manual enharmonic choice therefore
 * survived only until the next autosave, and a file that did contain the field had it silently
 * discarded on import.
 */

function withOverrides(
  project: Project,
  overrides: Readonly<Record<string, PitchSpelling>> | undefined,
): Project {
  const steps = project.progression.steps.map((step) =>
    step.kind === "chord" && step.id === "step-1"
      ? Object.freeze({
          ...step,
          ...(overrides !== undefined ? { explicitSpellingOverrides: overrides } : {}),
        })
      : step,
  );
  return Object.freeze<Project>({
    ...project,
    progression: Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
  });
}

function stepById(project: Project, id: string) {
  const step = project.progression.steps.find((candidate) => candidate.id === id);
  if (!step || step.kind !== "chord") throw new Error(`chord step ${id} not found`);
  return step;
}

describe("portable project saved-spelling overrides", () => {
  it("round-trips role-qualified and bare MIDI keys", () => {
    const overrides = Object.freeze({
      "upper:64": Object.freeze({ step: "F", alter: -1 }),
      "60": Object.freeze({ step: "B", alter: 1 }),
    } satisfies Record<string, PitchSpelling>);

    const serialized = encodePortableProject(withOverrides(createRichProjectFixture(), overrides));
    expect(serialized).toContain("explicitSpellingOverrides");

    const step = stepById(decodePortableProject(serialized), "step-1");
    expect(step.explicitSpellingOverrides).toEqual({
      "upper:64": { step: "F", alter: -1 },
      "60": { step: "B", alter: 1 },
    });
  });

  it("omits the field entirely when a step has no overrides", () => {
    const serialized = encodePortableProject(createRichProjectFixture());
    expect(serialized).not.toContain("explicitSpellingOverrides");
  });

  it("drops malformed override entries instead of rejecting the whole file", () => {
    const overrides = Object.freeze({
      "upper:64": Object.freeze({ step: "F", alter: -1 }),
    } satisfies Record<string, PitchSpelling>);
    const serialized = encodePortableProject(withOverrides(createRichProjectFixture(), overrides));

    const doc = JSON.parse(serialized) as {
      progression: { steps: Record<string, unknown>[] };
    };
    const target = doc.progression.steps.find((step) => step["id"] === "step-1");
    expect(target).toBeDefined();
    target!["explicitSpellingOverrides"] = {
      // Unknown diatonic step
      "99": { step: "H", alter: 0 },
      // Non-numeric key
      abc: { step: "C", alter: 1 },
      // Out-of-range alteration
      "61": { step: "D", alter: 99 },
      // Valid entry, must survive
      "62": { step: "E", alter: 1 },
    };

    // A corrupt spelling must not make an otherwise good project unopenable.
    const step = stepById(decodePortableProject(JSON.stringify(doc)), "step-1");
    expect(step.explicitSpellingOverrides).toEqual({ "62": { step: "E", alter: 1 } });
  });

  it("drops the field when every entry is malformed", () => {
    const serialized = encodePortableProject(createRichProjectFixture());
    const doc = JSON.parse(serialized) as {
      progression: { steps: Record<string, unknown>[] };
    };
    const target = doc.progression.steps.find((step) => step["id"] === "step-1");
    target!["explicitSpellingOverrides"] = { nonsense: { step: "Z", alter: 0 } };

    const step = stepById(decodePortableProject(JSON.stringify(doc)), "step-1");
    expect(step.explicitSpellingOverrides).toBeUndefined();
  });
});
