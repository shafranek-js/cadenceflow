import { describe, expect, it } from "vitest";
import projectSchema from "../../../specs/001-cadenceflow-core-studio/contracts/cadenceflow-project.schema.json";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../../src/persistence/portableProject";
import type { CardViewId } from "../../../src/domain/progression/step";
import type {
  MatrixCardTemplateState,
  ModuleTemplateState,
  Project,
} from "../../../src/domain/project/project";
import { createRichProjectFixture } from "../../fixtures/rich-project.fixture";
import { DEFAULT_VIEW_IDS } from "../../../src/ui/common/defaultViewIds";
import { PIANO_CARD_VIEWS } from "../../../src/instruments/piano/profile";
import { GUITAR_CARD_VIEWS } from "../../../src/instruments/guitar/profile";

/**
 * Drift guard for the `cardView` JSON-Schema enum.
 *
 * Regression context: `CardViewId` gained "guitar" and "tablature", the UI started
 * writing those values onto new Steps, but the schema enum kept only
 * ["harmonic", "piano", "staff"]. `encodePortableProject` validates the wire document
 * before returning it and throws `InvalidPortableProjectError` on failure, so autosave,
 * "Export Project..." and "Save Project As" all failed for any project containing such a
 * Step. The project became unsavable with no user-visible explanation.
 *
 * These tests fail loudly if the union and the schema drift apart again.
 */

// Vite transforms this at build time, so raw sources are inlined into the test bundle
// and no filesystem access (or cwd assumption) is needed at run time.
const sourceFiles = import.meta.glob("../../../src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const schemaCardViewEnum = projectSchema.$defs.chordStep.properties.cardView.enum as string[];

/** Every literal `cardView: "..."` / `cardViewOverride: "..."` written anywhere in `src`. */
function cardViewLiteralsUsedInSource(): string[] {
  const values = new Set<string>();
  for (const source of Object.values(sourceFiles)) {
    for (const match of source.matchAll(/cardView(?:Override)?:\s*"([a-z-]+)"/g)) {
      values.add(match[1]!);
    }
  }
  return [...values].sort();
}

/** A Project whose only chord Step carries the supplied card view. */
function projectWithCardView(project: Project, cardView: CardViewId): Project {
  const steps = project.progression.steps.map((step) =>
    step.kind === "chord" ? Object.freeze({ ...step, cardView }) : step,
  );
  return Object.freeze<Project>({
    ...project,
    progression: Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
  });
}

/** A Project whose active module carries one template card with the supplied override. */
function projectWithCardViewOverride(project: Project, cardViewOverride: CardViewId): Project {
  const moduleState = project.moduleTemplateStates[project.activeModule];
  const [existingKey] = Object.keys(moduleState.cards);
  const cardKey = existingKey ?? "I";
  const card: MatrixCardTemplateState = Object.freeze<MatrixCardTemplateState>({
    harmonicFunctionId: cardKey,
    explicitOverrides: Object.freeze({}),
    cardViewOverride,
  });
  const nextModule: ModuleTemplateState = Object.freeze<ModuleTemplateState>({
    cards: Object.freeze({ ...moduleState.cards, [cardKey]: card }),
  });
  return Object.freeze<Project>({
    ...project,
    moduleTemplateStates: Object.freeze({
      ...project.moduleTemplateStates,
      [project.activeModule]: nextModule,
    }),
  });
}

describe("portable project cardView schema coverage", () => {
  it("collects card view literals from the source tree (guards the glob itself)", () => {
    const literals = cardViewLiteralsUsedInSource();
    // If the glob silently breaks, this test fails instead of passing vacuously.
    expect(literals.length).toBeGreaterThan(0);
    expect(literals).toContain("harmonic");
  });

  it("accepts every card view literal that the source actually writes", () => {
    const uncovered = cardViewLiteralsUsedInSource().filter(
      (literal) => !schemaCardViewEnum.includes(literal),
    );
    expect(uncovered).toEqual([]);
  });

  it("keeps every card view offered by the UI inside the schema enum", () => {
    // `CardViewId` is a type, so it does not exist at run time; the concrete lists are the ones the
    // UI actually renders — the instrument card-view descriptors and the shared view toggle.
    //
    // An earlier version of this test asserted that every enum member must also appear as a
    // `cardView: "..."` string literal somewhere in `src`. That is not true and never was: only
    // "harmonic" is written literally, because the rest reach Steps through `command.payload.view`
    // and the schema's own enum. The assertion could only ever fail, and it said nothing about
    // whether the UI's options were actually persistable. This checks the property that matters.
    const offeredByUi = new Set<string>([
      ...GUITAR_CARD_VIEWS.map((view) => view.id),
      ...PIANO_CARD_VIEWS.map((view) => view.id),
      ...DEFAULT_VIEW_IDS,
    ]);
    expect(offeredByUi.size).toBeGreaterThan(1);

    const missing = [...offeredByUi].filter((view) => !schemaCardViewEnum.includes(view));
    expect(missing).toEqual([]);
  });

  it.each(["harmonic", "piano", "staff", "guitar", "tablature"] as const)(
    'round-trips cardView: "%s" through encode/decode',
    (cardView) => {
      const fixture = projectWithCardView(createRichProjectFixture(), cardView);

      const serialized = encodePortableProject(fixture);
      const restored = decodePortableProject(serialized);

      const chordSteps = restored.progression.steps.filter((step) => step.kind === "chord");
      expect(chordSteps.length).toBeGreaterThan(0);
      for (const step of chordSteps) {
        if (step.kind === "chord") expect(step.cardView).toBe(cardView);
      }
    },
  );

  it.each(["harmonic", "piano", "staff", "guitar", "tablature"] as const)(
    'round-trips cardViewOverride: "%s" through encode/decode',
    (cardViewOverride) => {
      const fixture = projectWithCardViewOverride(createRichProjectFixture(), cardViewOverride);

      const serialized = encodePortableProject(fixture);
      const restored = decodePortableProject(serialized);

      const cards = restored.moduleTemplateStates[restored.activeModule].cards;
      const overrides = Object.values(cards)
        .map((card) => card.cardViewOverride)
        .filter((value): value is CardViewId => value !== undefined);
      expect(overrides).toContain(cardViewOverride);
    },
  );
});
