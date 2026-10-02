import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createEffectiveMelodyTimeline } from "../../src/domain/melody/effectiveTimeline";
import type { HarmonicVariant } from "../../src/domain/harmony/chord";
import type { Project } from "../../src/domain/project/project";
import { musicalDuration } from "../../src/domain/timing/duration";
import {
  addRational,
  compareRational,
  rational,
  rationalToNumber,
  subtractRational,
} from "../../src/domain/timing/rational";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../src/persistence/portableProject";
import { createPianoRollSystemChordFixture } from "../fixtures/piano-roll-system-chord.fixture";

async function openStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });
}

async function installControlledAudioClock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    if (!NativeAudioContext) throw new Error("This browser has no AudioContext implementation");
    const testWindow = window as Window & { __pianoRollTestAudioTime?: number };
    testWindow.__pianoRollTestAudioTime = 0;
    class ControlledAudioContext extends NativeAudioContext {
      override get currentTime(): number {
        return testWindow.__pianoRollTestAudioTime ?? 0;
      }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: ControlledAudioContext,
    });
  });
}

async function setControlledAudioTime(page: Page, seconds: number): Promise<void> {
  await page.evaluate((value) => {
    (window as Window & { __pianoRollTestAudioTime?: number }).__pianoRollTestAudioTime = value;
  }, seconds);
}

async function importProject(page: Page, project: Project): Promise<string> {
  const text = encodePortableProject(project);
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: `${project.id}.cadenceflow`,
    mimeType: "application/json",
    buffer: Buffer.from(text, "utf8"),
  });
  await expect(page.getByTestId("project-menu-toggle")).toContainText(project.name);
  await expect(page.getByTestId("progression-view-btn-piano-roll")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  return text;
}

async function exportProjectText(page: Page): Promise<string> {
  const toggle = page.getByTestId("export-menu-toggle");
  if ((await toggle.getAttribute("aria-expanded")) === "true") await toggle.click();
  const downloadPromise = page.waitForEvent("download");
  await toggle.click();
  const menu = page.getByRole("menu", { name: "Export menu" });
  await expect(menu).toBeVisible();
  await menu.getByTestId("project-export-btn").click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Portable export did not provide a local file");
  const text = await readFile(path, "utf8");
  await page.keyboard.press("Escape");
  return text;
}

async function historyAction(page: Page, action: "Undo" | "Redo"): Promise<void> {
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) })
    .click();
}

async function expectUndoRedoBytes(page: Page, before: string, after: string): Promise<void> {
  await historyAction(page, "Undo");
  expect(await exportProjectText(page)).toBe(before);
  await historyAction(page, "Redo");
  expect(await exportProjectText(page)).toBe(after);
}

function step(project: Project, id: string) {
  const result = project.progression.steps.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Portable export omitted Step ${id}`);
  return result;
}

function sumDuration(project: Project) {
  return project.progression.steps.reduce(
    (total, candidate) => addRational(total, candidate.duration.beats),
    rational(0),
  );
}

function withMatrixVariant(
  project: Project,
  functionId: string,
  variant: HarmonicVariant,
): Project {
  const moduleState = project.moduleTemplateStates.progressions;
  const card = moduleState.cards[functionId] ?? {
    harmonicFunctionId: functionId,
    explicitOverrides: {},
  };
  return Object.freeze({
    ...project,
    moduleTemplateStates: Object.freeze({
      ...project.moduleTemplateStates,
      progressions: Object.freeze({
        ...moduleState,
        cards: Object.freeze({
          ...moduleState.cards,
          [functionId]: Object.freeze({ ...card, harmonicVariantOverride: variant }),
        }),
      }),
    }),
  });
}

function stepStart(project: Project, id: string) {
  let cursor = rational(0);
  for (const candidate of project.progression.steps) {
    if (candidate.id === id) return cursor;
    cursor = addRational(cursor, candidate.duration.beats);
  }
  throw new Error(`Portable export omitted Step ${id}`);
}

async function dragBoundaryToBeat(
  page: Page,
  boundary: import("@playwright/test").Locator,
  targetMeasureNumber: number,
  targetBeat: number,
): Promise<number> {
  const handleBox = await boundary.boundingBox();
  const targetMeasure = page.getByRole("region", { name: `Measure ${targetMeasureNumber}` });
  const gridBox = await targetMeasure.locator(".piano-roll-grid").boundingBox();
  if (!handleBox || !gridBox) throw new Error("Boundary drag geometry is unavailable");
  const measureStartBeat = (targetMeasureNumber - 1) * 4;
  const target = {
    x: gridBox.x + ((targetBeat - measureStartBeat) / 4) * gridBox.width,
    y: handleBox.y + handleBox.height / 2,
  };
  await page.mouse.move(handleBox.x + handleBox.width / 2, target.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
  const preview = Number(await boundary.getAttribute("aria-valuenow"));
  await page.mouse.up();
  await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
  return preview;
}

function melodySignature(project: Project, sourceStepIds: ReadonlySet<string>) {
  return createEffectiveMelodyTimeline(project)
    .filter((note) => sourceStepIds.has(note.sourceStepId))
    .sort(
      (left, right) =>
        compareRational(left.startBeats, right.startBeats) ||
        left.pitch.midiNumber - right.pitch.midiNumber ||
        compareRational(left.durationBeats, right.durationBeats),
    )
    .map((note) => ({
      pitch: note.pitch.midiNumber,
      start: `${note.startBeats.numerator}/${note.startBeats.denominator}`,
      duration: `${note.durationBeats.numerator}/${note.durationBeats.denominator}`,
    }));
}

function fullMelodySignature(project: Project) {
  return createEffectiveMelodyTimeline(project)
    .map((note) => ({
      pitch: note.pitch.midiNumber,
      start: `${note.startBeats.numerator}/${note.startBeats.denominator}`,
      duration: `${note.durationBeats.numerator}/${note.durationBeats.denominator}`,
    }))
    .sort((left, right) => {
      const [leftN, leftD] = left.start.split("/").map(Number);
      const [rightN, rightD] = right.start.split("/").map(Number);
      const onset = leftN! / leftD! - rightN! / rightD!;
      return onset || left.pitch - right.pitch || left.duration.localeCompare(right.duration);
    });
}

test("real portable import preserves replacement, generated Rest, and exact Undo/Redo snapshots", async ({
  page,
}) => {
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture();
  await importProject(page, fixture);

  const sourceA = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]');
  await sourceA.click();
  const panelA = page.getByTestId("piano-roll-system-chord-panel-0");
  await expect(panelA).toBeVisible();
  const beforeMatrixCancel = await exportProjectText(page);
  await panelA.getByRole("button", { name: "Matrix…" }).click();
  await page.getByTestId("chord-card-I").locator(".chord-main").click();
  await expect(panelA.getByRole("button", { name: "Replace", exact: true })).toBeDisabled();
  await panelA.getByRole("button", { name: "Cancel Matrix replacement" }).click();
  expect(await exportProjectText(page)).toBe(beforeMatrixCancel);

  const sourceF = page.locator('.piano-roll-chord[data-source-step-id="chord-f"]');
  await sourceF.scrollIntoViewIfNeeded();
  await sourceF.click();
  const panelF = page.getByTestId("piano-roll-system-chord-panel-2");
  await expect(panelF).toBeVisible();
  const beforeReplace = await exportProjectText(page);
  const beforeReplaceProject = decodePortableProject(beforeReplace);
  const beforeF = step(beforeReplaceProject, "chord-f");
  expect(beforeF.kind).toBe("chord");
  if (beforeF.kind !== "chord") throw new Error("Fixture target was not a chord");
  await panelF.getByRole("button", { name: /Replace with degree 5/ }).click();
  const afterReplace = await exportProjectText(page);
  const replacedProject = decodePortableProject(afterReplace);
  const replacedF = step(replacedProject, "chord-f");
  expect(replacedF.kind).toBe("chord");
  if (replacedF.kind !== "chord") throw new Error("Replacement changed the Step kind");
  expect(replacedF.harmonicFunction.functionId).toBe("V");
  expect(replacedF.id).toBe(beforeF.id);
  expect(replacedF.duration).toEqual(beforeF.duration);
  expect(replacedF.melody).toEqual(beforeF.melody);
  expect(replacedF.melodyInstrumentOverride).toBe(beforeF.melodyInstrumentOverride);
  expect(replacedF.performance).toEqual(beforeF.performance);
  expect(replacedF).not.toHaveProperty("explicitSpellingOverrides");
  expect(replacedProject.progression.sections).toEqual(beforeReplaceProject.progression.sections);
  expect(replacedProject.temporaryBranch).toEqual(beforeReplaceProject.temporaryBranch);
  expect(sumDuration(replacedProject)).toEqual(sumDuration(beforeReplaceProject));
  await expectUndoRedoBytes(page, beforeReplace, afterReplace);

  const generatedChord = page.locator('.piano-roll-chord[data-source-step-id="generated-e"]');
  await generatedChord.scrollIntoViewIfNeeded();
  await generatedChord.click();
  const generatedPanel = page.getByTestId("piano-roll-system-chord-panel-2");
  const beforeRest = await exportProjectText(page);
  const beforeRestProject = decodePortableProject(beforeRest);
  const melodyBeforeRest = melodySignature(beforeRestProject, new Set(["generated-e"]));
  expect(melodyBeforeRest.length).toBeGreaterThan(0);
  const preserveRestOwner = step(beforeRestProject, "rest-d");
  await generatedPanel.getByRole("button", { name: "Remove Harmony and make Rest" }).click();
  const afterRest = await exportProjectText(page);
  const afterRestProject = decodePortableProject(afterRest);
  const restedGenerated = step(afterRestProject, "generated-e");
  expect(restedGenerated.kind).toBe("rest");
  if (restedGenerated.kind !== "rest") throw new Error("Generated chord did not become Rest");
  expect(restedGenerated.authoredMelody?.sourceRecipe?.pitchMotion).toBe("outside-in");
  expect(restedGenerated.melodyInstrumentOverride).toBe("flute");
  expect(melodySignature(afterRestProject, new Set(["generated-e"]))).toEqual(melodyBeforeRest);
  expect(step(afterRestProject, "rest-d")).toEqual(preserveRestOwner);
  expect(sumDuration(afterRestProject)).toEqual(sumDuration(beforeRestProject));
  expect(afterRestProject.progression.sections).toEqual(beforeRestProject.progression.sections);
  expect(afterRestProject.temporaryBranch).toEqual(beforeRestProject.temporaryBranch);
  await expectUndoRedoBytes(page, beforeRest, afterRest);

  const beforeAuthoredRest = await exportProjectText(page);
  const beforeAuthoredRestProject = decodePortableProject(beforeAuthoredRest);
  const authoredMelodyBeforeRest = melodySignature(beforeAuthoredRestProject, new Set(["chord-f"]));
  const separateRestBefore = step(beforeAuthoredRestProject, "rest-d");
  await page.locator('.piano-roll-chord[data-source-step-id="chord-f"]').first().click();
  await panelF.getByRole("button", { name: "Remove Harmony and make Rest" }).click();
  const afterAuthoredRest = await exportProjectText(page);
  const afterAuthoredRestProject = decodePortableProject(afterAuthoredRest);
  const authoredRest = step(afterAuthoredRestProject, "chord-f");
  expect(authoredRest.kind).toBe("rest");
  if (authoredRest.kind !== "rest") throw new Error("Authored chord did not become Rest");
  expect(authoredRest.melodyInstrumentOverride).toBe("flute");
  expect(melodySignature(afterAuthoredRestProject, new Set(["chord-f"]))).toEqual(
    authoredMelodyBeforeRest,
  );
  expect(step(afterAuthoredRestProject, "rest-d")).toEqual(separateRestBefore);
  expect(afterAuthoredRestProject.progression.sections).toEqual(
    beforeAuthoredRestProject.progression.sections,
  );
  expect(afterAuthoredRestProject.temporaryBranch).toEqual(
    beforeAuthoredRestProject.temporaryBranch,
  );
  expect(sumDuration(afterAuthoredRestProject)).toEqual(sumDuration(beforeAuthoredRestProject));
  await expectUndoRedoBytes(page, beforeAuthoredRest, afterAuthoredRest);
});

test("Matrix replacement transfers its selected nonstandard variant onto an authored Rest", async ({
  page,
}) => {
  await openStudio(page);
  const variant: HarmonicVariant = Object.freeze({
    seventh: "minor7",
    extensions: Object.freeze([9]),
    suspensions: Object.freeze([]),
    alterations: Object.freeze([]),
  });
  const fixture = withMatrixVariant(createPianoRollSystemChordFixture(), "ii", variant);
  await importProject(page, fixture);

  const before = await exportProjectText(page);
  const beforeProject = decodePortableProject(before);
  const originalRest = step(beforeProject, "rest-d");
  expect(originalRest.kind).toBe("rest");
  if (originalRest.kind !== "rest") throw new Error("Expected the Matrix target to be a Rest");
  const originalMelody = melodySignature(beforeProject, new Set(["rest-d"]));
  expect(originalRest.authoredMelody?.notes).toHaveLength(2);

  const rest = page.locator('.piano-roll-chord[data-source-step-id="rest-d"]');
  await rest.click();
  const panel = page.getByTestId("piano-roll-system-chord-panel-1");
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Matrix…" }).click();
  await page.getByTestId("chord-card-ii").locator(".chord-main").click();
  const replaceButton = panel.getByRole("button", { name: "Replace", exact: true });
  await expect(replaceButton).toBeEnabled();
  await replaceButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("piano-roll-playhead")).toHaveCount(0);

  const after = await exportProjectText(page);
  const afterProject = decodePortableProject(after);
  const replaced = step(afterProject, "rest-d");
  expect(replaced.kind).toBe("chord");
  if (replaced.kind !== "chord") throw new Error("Matrix replacement did not restore Harmony");
  expect(replaced.harmonicVariant).toEqual(variant);
  expect(replaced.id).toBe(originalRest.id);
  expect(replaced.duration).toEqual(originalRest.duration);
  expect(replaced.melodyInstrumentOverride).toBe(originalRest.melodyInstrumentOverride);
  expect(replaced.melody?.mode).toBe("authored");
  if (replaced.melody?.mode !== "authored")
    throw new Error("Matrix replacement lost authored Rest Melody");
  expect(replaced.melody.phrase).toEqual(originalRest.authoredMelody);
  expect(replaced.melody.phrase.notes).toHaveLength(2);
  expect(melodySignature(afterProject, new Set(["rest-d"]))).toEqual(originalMelody);
  expect(afterProject.progression.sections).toEqual(beforeProject.progression.sections);
  expect(afterProject.temporaryBranch).toEqual(beforeProject.temporaryBranch);
  expect(sumDuration(afterProject)).toEqual(sumDuration(beforeProject));
  await expectUndoRedoBytes(page, before, after);
});

test("panel keyboard edits undo and redo without refocus and Escape restores the chord", async ({
  page,
}) => {
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture();
  const mutedFixture: Project = Object.freeze({
    ...fixture,
    harmonyTrack: Object.freeze({ ...fixture.harmonyTrack, muted: true }),
    melodyTrack: Object.freeze({ ...fixture.melodyTrack, muted: true }),
  });
  await importProject(page, mutedFixture);
  const chordA = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
  await chordA.click();
  const panel = page.getByTestId("piano-roll-system-chord-panel-0");
  const before = await exportProjectText(page);
  const originalChordCount = await page.getByTestId("piano-roll-chord").count();
  const splitButton = panel.getByRole("button", { name: "Split Step into equal halves" });

  await splitButton.focus();
  await page.keyboard.press("Enter");
  await expect(splitButton).toBeFocused();
  await expect(page.getByTestId("piano-roll-chord")).toHaveCount(originalChordCount + 1);
  await splitButton.press("Control+z");
  await expect(splitButton).toBeFocused();
  await expect(page.getByTestId("piano-roll-chord")).toHaveCount(originalChordCount);
  await splitButton.press("Control+Shift+z");
  await expect(splitButton).toBeFocused();
  await expect(page.getByTestId("piano-roll-chord")).toHaveCount(originalChordCount + 1);
  const after = await exportProjectText(page);
  expect(after).not.toBe(before);
  expect(step(decodePortableProject(after), "chord-a").duration.beats).toEqual(rational(2));
  await expectUndoRedoBytes(page, before, after);

  await panel.getByRole("button", { name: "Matrix…" }).click();
  await splitButton.focus();
  await page.keyboard.press("Escape");
  await expect(chordA).toBeFocused();
  await expect(panel.getByRole("button", { name: "Cancel Matrix replacement" })).toHaveCount(0);
  expect(await exportProjectText(page)).toBe(after);
  await expect(page.getByTestId("piano-roll-playhead")).toHaveCount(0);
});

test("portable duration ripple and generated Split preserve exact timeline and snapshots", async ({
  page,
}) => {
  await openStudio(page);
  await importProject(page, createPianoRollSystemChordFixture());
  const chordC = page.locator('.piano-roll-chord[data-source-step-id="chord-c"]');
  await chordC.scrollIntoViewIfNeeded();
  await chordC.click();
  const panel = page.getByTestId("piano-roll-system-chord-panel-1");
  const beforeRipple = await exportProjectText(page);
  const beforeRippleProject = decodePortableProject(beforeRipple);
  const originalGenerated = step(beforeRippleProject, "generated-e");
  const originalMelody = melodySignature(beforeRippleProject, new Set(["generated-e"]));
  const originalSections = beforeRippleProject.progression.sections;
  const originalBranch = beforeRippleProject.temporaryBranch;
  const originalLength = sumDuration(beforeRippleProject);
  await panel.getByRole("combobox", { name: "Harmony duration" }).selectOption("2/1");
  const afterRipple = await exportProjectText(page);
  const afterRippleProject = decodePortableProject(afterRipple);
  expect(step(afterRippleProject, "chord-c").duration.beats).toEqual({
    numerator: 2,
    denominator: 1,
  });
  expect(step(afterRippleProject, "rest-d")).toEqual(step(beforeRippleProject, "rest-d"));
  expect(step(afterRippleProject, "generated-e")).toEqual(originalGenerated);
  expect(melodySignature(afterRippleProject, new Set(["generated-e"]))).toEqual(
    originalMelody.map((note) => {
      const [numerator, denominator] = note.start.split("/").map(Number);
      const shifted = subtractRational(rational(numerator!, denominator!), rational(2));
      return { ...note, start: `${shifted.numerator}/${shifted.denominator}` };
    }),
  );
  expect(afterRippleProject.progression.sections).toEqual(originalSections);
  expect(afterRippleProject.temporaryBranch).toEqual(originalBranch);
  expect(sumDuration(afterRippleProject)).toEqual(subtractRational(originalLength, rational(2)));
  await expectUndoRedoBytes(page, beforeRipple, afterRipple);

  const generatedChord = page
    .locator('.piano-roll-chord[data-source-step-id="generated-e"]')
    .first();
  await generatedChord.scrollIntoViewIfNeeded();
  await generatedChord.click();
  const beforeSplit = await exportProjectText(page);
  const beforeSplitProject = decodePortableProject(beforeSplit);
  const beforeSplitMelody = melodySignature(beforeSplitProject, new Set(["generated-e"]));
  const beforeSplitLength = sumDuration(beforeSplitProject);
  const splitPanel = page.getByTestId("piano-roll-system-chord-panel-1");
  await splitPanel.getByRole("button", { name: "Split Step into equal halves" }).click();
  const afterSplit = await exportProjectText(page);
  const afterSplitProject = decodePortableProject(afterSplit);
  const originalHalf = step(afterSplitProject, "generated-e");
  const generatedIndex = afterSplitProject.progression.steps.findIndex(
    (candidate) => candidate.id === "generated-e",
  );
  const secondHalf = afterSplitProject.progression.steps[generatedIndex + 1];
  expect(originalHalf.kind).toBe("chord");
  expect(originalHalf.duration.beats).toEqual({ numerator: 2, denominator: 1 });
  expect(secondHalf?.kind).toBe("chord");
  expect(secondHalf?.id).not.toBe("generated-e");
  expect(secondHalf?.duration.beats).toEqual({ numerator: 2, denominator: 1 });
  if (originalHalf.kind !== "chord" || secondHalf?.kind !== "chord")
    throw new Error("Generated Split did not produce two chords");
  expect(originalHalf.melody?.mode).toBe("authored");
  expect(secondHalf.melody?.mode).toBe("authored");
  expect(melodySignature(afterSplitProject, new Set(["generated-e", secondHalf.id]))).toEqual(
    beforeSplitMelody,
  );
  expect(sumDuration(afterSplitProject)).toEqual(beforeSplitLength);
  await expectUndoRedoBytes(page, beforeSplit, afterSplit);

  const beforeRepeatedSplit = await exportProjectText(page);
  const beforeRepeatedSplitProject = decodePortableProject(beforeRepeatedSplit);
  const beforeRepeatedSplitMelody = melodySignature(
    beforeRepeatedSplitProject,
    new Set(["generated-e", secondHalf.id]),
  );
  const secondHalfChord = page
    .locator(`.piano-roll-chord[data-source-step-id="${secondHalf.id}"]`)
    .first();
  await secondHalfChord.scrollIntoViewIfNeeded();
  await secondHalfChord.click();
  const repeatedSplitPanel = page.getByTestId("piano-roll-system-chord-panel-2");
  await repeatedSplitPanel.getByRole("button", { name: "Split Step into equal halves" }).click();
  const afterRepeatedSplit = await exportProjectText(page);
  const afterRepeatedSplitProject = decodePortableProject(afterRepeatedSplit);
  const repeatedIndex = afterRepeatedSplitProject.progression.steps.findIndex(
    (candidate) => candidate.id === secondHalf.id,
  );
  const thirdHalf = afterRepeatedSplitProject.progression.steps[repeatedIndex + 1];
  if (!thirdHalf) throw new Error("Repeated Split did not produce a third chord");
  expect([
    step(afterRepeatedSplitProject, "generated-e").duration.beats,
    step(afterRepeatedSplitProject, secondHalf.id).duration.beats,
    thirdHalf.duration.beats,
  ]).toEqual([rational(2), rational(1), rational(1)]);
  expect(
    melodySignature(
      afterRepeatedSplitProject,
      new Set(["generated-e", secondHalf.id, thirdHalf.id]),
    ),
  ).toEqual(beforeRepeatedSplitMelody);
  expect(sumDuration(afterRepeatedSplitProject)).toEqual(sumDuration(beforeRepeatedSplitProject));
  await expectUndoRedoBytes(page, beforeRepeatedSplit, afterRepeatedSplit);
});

test("pointer boundary transfer snaps to every triplet grid and stays in the System row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture();
  await importProject(page, fixture);
  const sourceChord = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
  await sourceChord.click();
  const boundary = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="right"]',
  );
  await expect(boundary).toBeVisible();
  const tripletTargets = [
    { snap: "1/1 triplet", expectedBoundary: rational(16, 3) },
    { snap: "1/2 triplet", expectedBoundary: rational(16, 3) },
    { snap: "1/4 triplet", expectedBoundary: rational(14, 3) },
    { snap: "1/8 triplet", expectedBoundary: rational(13, 3) },
    { snap: "1/16 triplet", expectedBoundary: rational(25, 6) },
  ] as const;

  for (const target of tripletTargets) {
    const before = await exportProjectText(page);
    await page.getByLabel("Snap resolution").selectOption(target.snap);
    const expectedBoundary = rationalToNumber(target.expectedBoundary);
    const preview = await dragBoundaryToBeat(page, boundary, 2, expectedBoundary);
    expect(preview).toBeCloseTo(expectedBoundary, 6);
    const after = await exportProjectText(page);
    const updated = decodePortableProject(after);
    const exactBeatFourNote = createEffectiveMelodyTimeline(updated).find(
      (note) => note.pitch.midiNumber === 69 && compareRational(note.startBeats, rational(4)) === 0,
    );
    expect(exactBeatFourNote?.sourceStepId).toBe("chord-a");
    expect(step(updated, "chord-a").duration.beats).toEqual(target.expectedBoundary);
    expect(step(updated, "chord-b").duration.beats).toEqual(
      subtractRational(rational(8), target.expectedBoundary),
    );
    expect(
      melodySignature(updated, new Set(updated.progression.steps.map((candidate) => candidate.id))),
    ).toEqual(
      melodySignature(fixture, new Set(fixture.progression.steps.map((candidate) => candidate.id))),
    );
    expect(compareRational(stepStart(updated, "chord-c"), rational(8))).toBe(0);
    expect(sumDuration(updated)).toEqual(sumDuration(fixture));
    await expectUndoRedoBytes(page, before, after);
    await historyAction(page, "Undo");
    expect(await exportProjectText(page)).toBe(before);
  }
});

test("pointer boundary transfer works in both directions with exact portable pair durations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture();
  await importProject(page, fixture);
  const beforeExpansion = await exportProjectText(page);
  const sourceChord = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
  await sourceChord.click();
  await page.getByLabel("Snap resolution").selectOption("1/8 triplet");
  const boundary = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="right"]',
  );
  const forwardPreview = await dragBoundaryToBeat(page, boundary, 2, 13 / 3);
  expect(forwardPreview).toBeCloseTo(13 / 3, 6);
  const afterExpansion = await exportProjectText(page);
  await expectUndoRedoBytes(page, beforeExpansion, afterExpansion);

  const beforeReverse = await exportProjectText(page);
  const reversePreview = await dragBoundaryToBeat(page, boundary, 1, 11 / 3);
  expect(reversePreview).toBeCloseTo(11 / 3, 6);
  const afterReverse = await exportProjectText(page);
  const beforeProject = decodePortableProject(beforeExpansion);
  const afterProject = decodePortableProject(afterReverse);
  const exactBeatFourNote = createEffectiveMelodyTimeline(afterProject).find(
    (note) => note.pitch.midiNumber === 69 && compareRational(note.startBeats, rational(4)) === 0,
  );
  expect(exactBeatFourNote?.sourceStepId).toBe("chord-b");
  expect(step(afterProject, "chord-a").duration.beats).toEqual(rational(11, 3));
  expect(step(afterProject, "chord-b").duration.beats).toEqual(rational(13, 3));
  expect(
    compareRational(stepStart(afterProject, "chord-c"), stepStart(beforeProject, "chord-c")),
  ).toBe(0);
  expect(step(afterProject, "chord-c")).toEqual(step(beforeProject, "chord-c"));
  expect(
    melodySignature(
      afterProject,
      new Set(afterProject.progression.steps.map((candidate) => candidate.id)),
    ),
  ).toEqual(
    melodySignature(
      beforeProject,
      new Set(beforeProject.progression.steps.map((candidate) => candidate.id)),
    ),
  );
  expect(afterProject.progression.sections).toEqual(beforeProject.progression.sections);
  expect(afterProject.progression.loopRegion).toEqual(beforeProject.progression.loopRegion);
  expect(afterProject.temporaryBranch).toEqual(beforeProject.temporaryBranch);
  expect(sumDuration(afterProject)).toEqual(sumDuration(beforeProject));
  await expectUndoRedoBytes(page, beforeReverse, afterReverse);
});

test("only real Step boundaries get handles across measure and System cuts", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture();
  const first = fixture.progression.steps[0];
  if (!first) throw new Error("Fixture is missing its first Step");
  const spanningProject: Project = Object.freeze({
    ...fixture,
    progression: Object.freeze({
      ...fixture.progression,
      steps: Object.freeze([
        Object.freeze({ ...first, duration: musicalDuration(rational(8)) }),
        ...fixture.progression.steps.slice(1),
      ]),
    }),
  });
  await importProject(page, spanningProject);
  await page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first().click();

  await expect(
    page
      .getByRole("region", { name: "Measure 1" })
      .locator(
        '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="right"]',
      ),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Measure 2" })
      .locator(
        '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="right"]',
      ),
  ).toHaveCount(1);
  const chordB = page.locator('.piano-roll-chord[data-source-step-id="chord-b"]').first();
  await chordB.scrollIntoViewIfNeeded();
  await chordB.click();
  await expect(
    page
      .getByRole("region", { name: "Measure 3" })
      .locator(
        '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-b"][data-boundary-edge="left"]',
      ),
  ).toHaveCount(1);
});

test("boundary drag autoscrolls across Systems and pointer cancellation preserves the snapshot", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 360 });
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture();
  await importProject(page, fixture);
  const before = await exportProjectText(page);
  await page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first().click();
  const boundary = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="right"]',
  );
  await boundary.scrollIntoViewIfNeeded();
  const box = await boundary.boundingBox();
  if (!box) throw new Error("Boundary handle has no visible bounds");
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const startingScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let index = 0; index < 8; index += 1) {
    await page.mouse.move(start.x, page.viewportSize()!.height - 8);
    await page.waitForTimeout(40);
  }
  await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
  const endingScroll = await page.evaluate(() => window.scrollY);
  expect(endingScroll).toBeGreaterThan(startingScroll);
  await boundary.evaluate((element) =>
    element.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 })),
  );
  await page.mouse.up();
  await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
  expect(await exportProjectText(page)).toBe(before);
});

test("cross-System boundary autoscroll commits exact pair data and one Undo/Redo", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 360 });
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture();
  const project: Project = Object.freeze({
    ...fixture,
    presentation: Object.freeze({ ...fixture.presentation, measuresPerSystem: 1 }),
  });
  await importProject(page, project);

  const sourceChord = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
  await sourceChord.click();
  const audition = page.getByTestId("piano-roll-playhead");
  if (await audition.count()) await expect(audition).toHaveCount(0, { timeout: 8_000 });

  const before = await exportProjectText(page);
  const beforeProject = decodePortableProject(before);
  const boundary = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="right"]',
  );
  await boundary.scrollIntoViewIfNeeded();
  const handleBox = await boundary.boundingBox();
  if (!handleBox) throw new Error("System 1 boundary handle is not visible");
  const start = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  };
  const startingScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();

  const targetGrid = page.getByRole("region", { name: "Measure 2" }).locator(".piano-roll-grid");
  let targetBox = await targetGrid.boundingBox();
  for (let index = 0; index < 32; index += 1) {
    if (
      targetBox &&
      targetBox.y < (page.viewportSize()?.height ?? 360) - 44 &&
      targetBox.y + targetBox.height > 36
    )
      break;
    await page.mouse.move(start.x, (page.viewportSize()?.height ?? 360) - 8);
    await page.waitForTimeout(24);
    targetBox = await targetGrid.boundingBox();
  }
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(startingScroll);
  targetBox = await targetGrid.boundingBox();
  if (!targetBox || targetBox.y >= 352 || targetBox.y + targetBox.height <= 36)
    throw new Error("Measure 2 did not enter the viewport during boundary autoscroll");
  const target = {
    x: targetBox.x + targetBox.width / 4,
    y: Math.max(36, Math.min(320, targetBox.y + targetBox.height / 2)),
  };
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
  expect(Number(await boundary.getAttribute("aria-valuenow"))).toBeCloseTo(5, 6);
  await page.mouse.up();
  await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
  await expect(page.getByTestId("piano-roll-playhead")).toHaveCount(0);

  const after = await exportProjectText(page);
  const afterProject = decodePortableProject(after);
  expect(step(afterProject, "chord-a").duration.beats).toEqual(rational(5));
  expect(step(afterProject, "chord-b").duration.beats).toEqual(rational(3));
  expect(stepStart(afterProject, "chord-a")).toEqual(rational(0));
  expect(sumDuration(afterProject)).toEqual(sumDuration(beforeProject));
  expect(afterProject.progression.steps.map((candidate) => candidate.id)).toEqual(
    beforeProject.progression.steps.map((candidate) => candidate.id),
  );
  for (const stepId of ["chord-c", "rest-d", "generated-e", "chord-f"]) {
    expect(step(afterProject, stepId)).toEqual(step(beforeProject, stepId));
    expect(stepStart(afterProject, stepId)).toEqual(stepStart(beforeProject, stepId));
  }
  expect(fullMelodySignature(afterProject)).toEqual(fullMelodySignature(beforeProject));

  const beforeMelody = createEffectiveMelodyTimeline(beforeProject);
  const afterMelody = createEffectiveMelodyTimeline(afterProject);
  expect(afterMelody.map((note) => note.sourceStepId)).toEqual(
    beforeMelody.map((note) => {
      if (note.sourceStepId !== "chord-a" && note.sourceStepId !== "chord-b")
        return note.sourceStepId;
      return compareRational(note.startBeats, rational(5)) < 0 ? "chord-a" : "chord-b";
    }),
  );
  const movedBNote = afterMelody.find(
    (note) => note.pitch.midiNumber === 67 && compareRational(note.startBeats, rational(4)) === 0,
  );
  expect(movedBNote?.sourceStepId).toBe("chord-a");
  const chordAAfter = step(afterProject, "chord-a");
  expect(chordAAfter.kind).toBe("chord");
  if (chordAAfter.kind !== "chord" || chordAAfter.melody?.mode !== "authored")
    throw new Error("Cross-System reanchoring did not preserve authored Melody");
  expect(new Set(chordAAfter.melody.phrase.notes.map((note) => note.id)).size).toBe(
    chordAAfter.melody.phrase.notes.length,
  );
  await expectUndoRedoBytes(page, before, after);
});

test("keyboard boundary resize clamps both short neighbors and keeps project edges fixed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture();
  await importProject(page, fixture);
  const chordA = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
  await chordA.click();
  const playhead = page.getByTestId("piano-roll-playhead");
  await expect(playhead.first()).toBeVisible({ timeout: 5_000 });
  await expect(playhead).toHaveCount(0, { timeout: 8_000 });
  await page.getByLabel("Snap resolution").selectOption("1/8");

  const startHandle = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="left"]',
  );
  await expect(startHandle).toHaveCount(0);
  const boundary = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="right"]',
  );
  const beforeMaximum = await exportProjectText(page);
  await boundary.focus();
  for (let index = 0; index < 32; index += 1) await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
  expect(Number(await boundary.getAttribute("aria-valuenow"))).toBeCloseTo(7.5, 6);
  await page.keyboard.press("Enter");
  const afterMaximum = await exportProjectText(page);
  const maximumProject = decodePortableProject(afterMaximum);
  expect(step(maximumProject, "chord-a").duration.beats).toEqual(rational(15, 2));
  expect(step(maximumProject, "chord-b").duration.beats).toEqual(rational(1, 2));
  expect(stepStart(maximumProject, "chord-c")).toEqual(rational(8));
  expect(sumDuration(maximumProject)).toEqual(sumDuration(fixture));
  await page.waitForTimeout(100);
  await expect(playhead).toHaveCount(0);
  await expectUndoRedoBytes(page, beforeMaximum, afterMaximum);

  const beforeMinimum = await exportProjectText(page);
  await boundary.focus();
  for (let index = 0; index < 48; index += 1) await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
  expect(Number(await boundary.getAttribute("aria-valuenow"))).toBeCloseTo(0.5, 6);
  await page.keyboard.press("Enter");
  const afterMinimum = await exportProjectText(page);
  const minimumProject = decodePortableProject(afterMinimum);
  expect(step(minimumProject, "chord-a").duration.beats).toEqual(rational(1, 2));
  expect(step(minimumProject, "chord-b").duration.beats).toEqual(rational(15, 2));
  expect(stepStart(minimumProject, "chord-c")).toEqual(rational(8));
  expect(sumDuration(minimumProject)).toEqual(sumDuration(fixture));
  expect(await playhead.count()).toBe(0);
  await expectUndoRedoBytes(page, beforeMinimum, afterMinimum);

  const finalChord = page.locator('.piano-roll-chord[data-source-step-id="chord-f"]').first();
  await finalChord.scrollIntoViewIfNeeded();
  await finalChord.click();
  if (await playhead.count()) await expect(playhead).toHaveCount(0, { timeout: 8_000 });
  await expect(
    page.locator(
      '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-f"][data-boundary-edge="right"]',
    ),
  ).toHaveCount(0);
});

test("lost capture, blur, view change and stale Project updates cancel boundary previews", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture();
  await importProject(page, fixture);
  const before = await exportProjectText(page);
  const beforeProject = decodePortableProject(before);
  await page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first().click();
  const boundary = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="right"]',
  );
  const targetGrid = page.getByRole("region", { name: "Measure 2" }).locator(".piano-roll-grid");
  const startPreview = async () => {
    const handleBox = await boundary.boundingBox();
    const gridBox = await targetGrid.boundingBox();
    if (!handleBox || !gridBox) throw new Error("Boundary preview geometry is unavailable");
    const start = {
      x: handleBox.x + handleBox.width / 2,
      y: handleBox.y + handleBox.height / 2,
    };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(gridBox.x + gridBox.width / 8, start.y, { steps: 5 });
    await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
  };

  await startPreview();
  await boundary.evaluate((element) =>
    element.dispatchEvent(new PointerEvent("lostpointercapture", { bubbles: true, pointerId: 1 })),
  );
  await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
  await page.mouse.up();
  expect(await exportProjectText(page)).toBe(before);

  await startPreview();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
  await page.mouse.up();
  expect(await exportProjectText(page)).toBe(before);

  await startPreview();
  await page
    .getByTestId("progression-view-btn-piano")
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByTestId("progression-view-btn-piano")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
  await page.mouse.up();
  const afterViewChange = decodePortableProject(await exportProjectText(page));
  expect(afterViewChange.progression.steps).toEqual(beforeProject.progression.steps);
  await page
    .getByTestId("progression-view-btn-piano-roll")
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByTestId("progression-view-btn-piano-roll")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first().click();

  const beforeStaleUpdate = await exportProjectText(page);
  await startPreview();
  await page
    .getByTestId("piano-roll-system-chord-panel-0")
    .getByRole("group", { name: "Harmony duration" })
    .getByRole("combobox", { name: "Harmony duration" })
    .selectOption("2/1");
  await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
  await page.mouse.up();
  const afterStaleUpdate = await exportProjectText(page);
  const changedProject = decodePortableProject(afterStaleUpdate);
  expect(step(changedProject, "chord-a").duration.beats).toEqual(rational(2));
  expect(compareRational(stepStart(changedProject, "chord-b"), rational(2))).toBe(0);
  await historyAction(page, "Undo");
  expect(await exportProjectText(page)).toBe(beforeStaleUpdate);
});

test("Tie preserves the Shift-selected group in the menu and merges collision owners atomically", async ({
  page,
}) => {
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture();
  await importProject(page, fixture);
  const beforeChordSelection = await exportProjectText(page);
  const chordA = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]');
  const chordB = page.locator('.piano-roll-chord[data-source-step-id="chord-b"]');
  await chordA.click();
  await chordB.click({ modifiers: ["Shift"] });
  const selectedPanel = page.getByTestId("piano-roll-system-chord-panel-0");
  await expect(selectedPanel.getByRole("button", { name: "Tie", exact: true })).toBeEnabled();
  expect(await exportProjectText(page)).toBe(beforeChordSelection);
  const beforeTie = await exportProjectText(page);
  expect(beforeTie).toBe(beforeChordSelection);
  await chordB.click({ button: "right" });
  await expect(chordA).toHaveAttribute("aria-pressed", "true");
  await expect(chordB).toHaveAttribute("aria-pressed", "true");
  expect(await exportProjectText(page)).toBe(beforeTie);
  await chordB.click({ button: "right" });
  const menu = page.getByRole("menu", { name: /Melody actions/ });
  const tieMenuItem = menu.getByRole("menuitem", { name: "Tie selected chords" });
  await expect(tieMenuItem).toBeEnabled();
  await tieMenuItem.click();
  const afterTie = await exportProjectText(page);
  const beforeProject = decodePortableProject(beforeTie);
  const afterProject = decodePortableProject(afterTie);
  const tied = step(afterProject, "chord-a");
  expect(afterProject.progression.steps.map((candidate) => candidate.id)).toEqual([
    "chord-a",
    "chord-c",
    "rest-d",
    "generated-e",
    "chord-f",
  ]);
  expect(tied.kind).toBe("chord");
  expect(tied.duration.beats).toEqual({ numerator: 8, denominator: 1 });
  expect(tied.melodyInstrumentOverride).toBe("flute");
  if (tied.kind !== "chord" || tied.melody?.mode !== "authored")
    throw new Error("Tied Step did not preserve authored Melody");
  expect(tied.melody.phrase.notes).toHaveLength(4);
  expect(new Set(tied.melody.phrase.notes.map((note) => note.id)).size).toBe(4);
  expect(afterProject.progression.loopRegion).toEqual({
    startStepId: "chord-a",
    endStepId: "chord-a",
  });
  expect(afterProject.temporaryBranch?.rejoinStepId).toBe("chord-c");
  expect(afterProject.progression.sections).toEqual(beforeProject.progression.sections);
  expect(step(afterProject, "chord-c")).toEqual(step(beforeProject, "chord-c"));
  expect(sumDuration(afterProject)).toEqual(sumDuration(beforeProject));
  await expectUndoRedoBytes(page, beforeTie, afterTie);

  const tiedChordA = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
  const chordC = page.locator('.piano-roll-chord[data-source-step-id="chord-c"]');
  await tiedChordA.click();
  await chordC.click({ modifiers: ["Shift"] });
  const sectionPanel = page.getByTestId("piano-roll-system-chord-panel-1");
  const tieButton = sectionPanel.getByRole("button", { name: "Tie", exact: true });
  await expect(tieButton).toBeDisabled();
  await expect(sectionPanel.getByRole("status")).toContainText("Song Section");

  const restD = page.locator('.piano-roll-chord[data-source-step-id="rest-d"]');
  await chordC.click();
  await restD.click({ modifiers: ["Shift"] });
  await expect(tieButton).toBeDisabled();
  await expect(sectionPanel.getByRole("status")).toContainText("Rest");
});

test("keyboard Harmony auditions follow a controlled audio clock through replacement and exact ends", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await installControlledAudioClock(page);
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture();
  const project: Project = Object.freeze({
    ...fixture,
    presentation: Object.freeze({ ...fixture.presentation, measuresPerSystem: 1 }),
  });
  await importProject(page, project);
  const beforeAuditions = await exportProjectText(page);
  const chordA = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
  const chordB = page.locator('.piano-roll-chord[data-source-step-id="chord-b"]').first();
  const playhead = page.getByTestId("piano-roll-playhead");

  await setControlledAudioTime(page, 10);
  await chordA.focus();
  await page.keyboard.press("Enter");
  await expect(playhead.first()).toBeVisible({ timeout: 10_000 });
  await expect(playhead.first()).toHaveAttribute("data-audition-end-beat", "4");
  await setControlledAudioTime(page, 12.39);
  await expect
    .poll(async () => Number(await playhead.first().getAttribute("data-current-beat")))
    .toBeGreaterThan(3.9);
  await setControlledAudioTime(page, 12.4);
  await expect(playhead).toHaveCount(0);

  await setControlledAudioTime(page, 12.5);
  await chordA.focus();
  await page.keyboard.press("Space");
  await expect(playhead.first()).toBeVisible();
  await setControlledAudioTime(page, 13);
  await chordB.focus();
  await page.keyboard.press("Enter");
  await expect(playhead.first()).toBeVisible();
  await expect(playhead.first()).toHaveAttribute("data-audition-end-beat", "8");
  await setControlledAudioTime(page, 14.9);
  await expect
    .poll(async () => Number(await playhead.first().getAttribute("data-current-beat")))
    .toBeGreaterThan(7);
  await page
    .locator(".score-system-header")
    .nth(1)
    .evaluate((element) => {
      const top = element.getBoundingClientRect().top + window.scrollY;
      const appHeaderBottom =
        document.querySelector<HTMLElement>(".app-header")?.getBoundingClientRect().bottom ?? 0;
      window.scrollTo({ top: Math.max(0, top - appHeaderBottom - 8), behavior: "instant" });
    });
  const activeMeasure = page.getByRole("region", { name: "Measure 2" });
  await expect(activeMeasure.locator("button.piano-roll-note").first()).toBeVisible();
  await expect(activeMeasure.getByTestId("piano-roll-playhead")).toBeVisible();
  await page.screenshot({ path: "test-results/music-visible-active-playhead-1280x720.png" });
  await setControlledAudioTime(page, 15.399);
  await expect(playhead.first()).toBeVisible();
  await setControlledAudioTime(page, 15.4);
  await expect(playhead).toHaveCount(0);
  expect(await exportProjectText(page)).toBe(beforeAuditions);
});

test("Harmony playhead crosses System boundaries and stops at the audio-clock endpoint", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture();
  const first = fixture.progression.steps[0];
  if (!first) throw new Error("Fixture is missing its first Step");
  const spanningProject: Project = Object.freeze({
    ...fixture,
    presentation: Object.freeze({ ...fixture.presentation, measuresPerSystem: 1 }),
    progression: Object.freeze({
      ...fixture.progression,
      steps: Object.freeze([
        Object.freeze({ ...first, duration: musicalDuration(rational(12)) }),
        ...fixture.progression.steps.slice(1),
      ]),
    }),
  });
  await importProject(page, spanningProject);
  const beforeAudition = await exportProjectText(page);
  const chordA = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
  await chordA.click();
  const thirdMeasure = page.getByRole("region", { name: "Measure 3" });
  await thirdMeasure.scrollIntoViewIfNeeded();
  const thirdMeasurePlayhead = thirdMeasure.getByTestId("piano-roll-playhead");
  await expect(thirdMeasurePlayhead).toBeVisible({ timeout: 12_000 });
  await expect
    .poll(async () => Number(await thirdMeasurePlayhead.getAttribute("data-current-beat")))
    .toBeGreaterThanOrEqual(8);
  await page.screenshot({ path: "test-results/system-chord-playhead-cross-system-1280x900.png" });
  await expect(page.getByTestId("piano-roll-playhead")).toHaveCount(0, { timeout: 10_000 });
  expect(await exportProjectText(page)).toBe(beforeAudition);
});
