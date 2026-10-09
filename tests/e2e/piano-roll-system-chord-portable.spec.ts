import { generatedMelodyRecipe } from "../../src/domain/melody/types";
import { requireChord } from "../fixtures/assertions";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { LookAheadScheduler } from "../../src/audio/scheduler";
import { createMatrixChordStep } from "../../src/app/commands/matrixCommands";
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
    const testWindow = window as Window & {
      __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean;
      __pianoRollTestAudioTime?: number;
    };
    testWindow.__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
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

function withSameMeasureChordPair(project: Project): Project {
  const [first, second, ...tail] = project.progression.steps;
  if (!first || !second) throw new Error("The fixture needs two leading chords");
  const spacer = Object.freeze({
    id: "boundary-spacer-rest",
    kind: "rest" as const,
    duration: musicalDuration(rational(4)),
  });
  return Object.freeze({
    ...project,
    progression: Object.freeze({
      ...project.progression,
      steps: Object.freeze([
        Object.freeze({ ...first, duration: musicalDuration(rational(2)) }),
        Object.freeze({ ...second, duration: musicalDuration(rational(2)) }),
        spacer,
        ...tail,
      ]),
    }),
  });
}

function withDifferentSameMeasureChordPair(project: Project): Project {
  const paired = withSameMeasureChordPair(project);
  const left = paired.progression.steps.find((candidate) => candidate.id === "chord-a");
  const right = paired.progression.steps.find((candidate) => candidate.id === "chord-b");
  if (!left || left.kind !== "chord" || !right || right.kind !== "chord")
    throw new Error("The fixture needs two leading chords");
  const replacement = createMatrixChordStep(paired, "V", right.id);
  const differentRight = Object.freeze({
    ...right,
    harmonicFunction: replacement.harmonicFunction,
    harmonicVariant: replacement.harmonicVariant,
  });
  return Object.freeze({
    ...paired,
    progression: Object.freeze({
      ...paired.progression,
      steps: Object.freeze(
        paired.progression.steps.map((candidate) =>
          candidate.id === differentRight.id ? differentRight : candidate,
        ),
      ),
    }),
  });
}

function withDistinctChordResizeParameters(project: Project): Project {
  const steps = project.progression.steps.map((candidate) => {
    if (candidate.kind !== "chord") return candidate;
    if (candidate.id === "chord-a")
      return Object.freeze({
        ...candidate,
        performance: Object.freeze({
          ...candidate.performance,
          articulation: "block" as const,
          register: 1 as const,
          masterVelocity: 91,
        }),
        melodyInstrumentOverride: "violin" as const,
      });
    if (candidate.id === "chord-b")
      return Object.freeze({
        ...candidate,
        performance: Object.freeze({
          ...candidate.performance,
          articulation: "arp-up" as const,
          register: -1 as const,
          masterVelocity: 57,
        }),
        melodyInstrumentOverride: "oboe" as const,
      });
    return candidate;
  });
  return Object.freeze({
    ...project,
    progression: Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
  });
}

function withSameMeasureChordRestPair(project: Project, restFirst = false): Project {
  const chordStep = project.progression.steps.find((candidate) => candidate.id === "chord-a");
  const gap = project.progression.steps.find((candidate) => candidate.id === "rest-d");
  if (!chordStep || chordStep.kind !== "chord" || !gap || gap.kind !== "rest")
    throw new Error("The portable fixture needs chord-a and rest-d");
  const pairChord = Object.freeze({ ...chordStep, duration: musicalDuration(rational(2)) });
  const pairRest = Object.freeze({ ...gap, duration: musicalDuration(rational(2)) });
  const tail = project.progression.steps.filter(
    (candidate) => candidate.id !== chordStep.id && candidate.id !== gap.id,
  );
  const sections = project.progression.sections?.map((section) =>
    restFirst && section.startStepId === chordStep.id
      ? Object.freeze({ ...section, startStepId: gap.id })
      : section,
  );
  return Object.freeze({
    ...project,
    progression: Object.freeze({
      ...project.progression,
      steps: Object.freeze(
        restFirst ? [pairRest, pairChord, ...tail] : [pairChord, pairRest, ...tail],
      ),
      ...(sections ? { sections: Object.freeze(sections) } : {}),
    }),
  });
}

function withFirstMeasureRest(project: Project): Project {
  const chordStep = project.progression.steps.find((candidate) => candidate.id === "chord-a");
  const gap = project.progression.steps.find((candidate) => candidate.id === "rest-d");
  if (!chordStep || chordStep.kind !== "chord" || !gap || gap.kind !== "rest")
    throw new Error("The portable fixture needs chord-a and rest-d");
  const firstMeasureRest = Object.freeze({ ...gap, duration: musicalDuration(rational(4)) });
  const secondMeasureChord = Object.freeze({
    ...chordStep,
    duration: musicalDuration(rational(4)),
  });
  const tail = project.progression.steps.filter(
    (candidate) => candidate.id !== chordStep.id && candidate.id !== gap.id,
  );
  return Object.freeze({
    ...project,
    progression: Object.freeze({
      ...project.progression,
      steps: Object.freeze([firstMeasureRest, secondMeasureChord, ...tail]),
    }),
  });
}

async function installAudioScheduleCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    type SchedulerStartArgs = Parameters<LookAheadScheduler["start"]>;
    const target = window as Window & {
      __cadenceflow_audio__?: {
        readonly LookAheadScheduler?: { prototype: Pick<LookAheadScheduler, "start"> };
      };
      __capturedCadenceflowAudioEvents__?: readonly {
        readonly startSeconds: number;
        readonly channelRole: string;
        readonly stepIndex?: number;
      }[];
    };
    const scheduler = target.__cadenceflow_audio__?.LookAheadScheduler;
    if (!scheduler) throw new Error("The development audio scheduler hook is unavailable");
    const originalStart = scheduler.prototype.start;
    scheduler.prototype.start = function (this: LookAheadScheduler, ...args: SchedulerStartArgs) {
      const [events] = args;
      target.__capturedCadenceflowAudioEvents__ = events.map((event) => ({
        startSeconds: event.startSeconds,
        channelRole: event.channelRole,
        ...(event.stepIndex !== undefined ? { stepIndex: event.stepIndex } : {}),
      }));
      return originalStart.call(this, ...args);
    };
  });
}

async function capturedAudioEvents(page: Page) {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __capturedCadenceflowAudioEvents__?: readonly {
            readonly startSeconds: number;
            readonly channelRole: string;
            readonly stepIndex?: number;
          }[];
        }
      ).__capturedCadenceflowAudioEvents__ ?? [],
  );
}

async function clearCapturedAudioEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as Window & { __capturedCadenceflowAudioEvents__?: readonly unknown[] })[
      "__capturedCadenceflowAudioEvents__"
    ] = [];
  });
}

async function playAndCaptureAudioEvents(page: Page) {
  await installAudioScheduleCapture(page);
  const controls = page.getByRole("group", { name: "Progression playback controls" });
  await setControlledAudioTime(page, 20);
  await controls.getByRole("button", { name: "Play", exact: true }).click();
  await expect(controls.getByRole("button", { name: "Pause" })).toBeEnabled();
  return capturedAudioEvents(page);
}

function withEmAtFourAndFAtEight(project: Project): Project {
  const steps = project.progression.steps.map((step) => {
    const functionId = step.id === "chord-b" ? "iii" : step.id === "chord-c" ? "IV" : null;
    if (step.kind !== "chord" || !functionId) return step;
    const replacement = createMatrixChordStep(project, functionId, step.id);
    const { explicitSpellingOverrides: _discarded, ...withoutSpelling } = step;
    return Object.freeze({
      ...withoutSpelling,
      harmonicFunction: replacement.harmonicFunction,
      harmonicVariant: replacement.harmonicVariant,
    });
  });
  return Object.freeze({
    ...project,
    progression: Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
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
  altModifier = false,
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
  if (altModifier) await page.keyboard.down("Alt");
  try {
    await page.mouse.move(handleBox.x + handleBox.width / 2, target.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
    const preview = Number(await boundary.getAttribute("aria-valuenow"));
    await page.mouse.up();
    await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
    return preview;
  } finally {
    if (altModifier) await page.keyboard.up("Alt");
  }
}

async function cancelBoundaryDragToBeat(
  page: Page,
  boundary: import("@playwright/test").Locator,
  targetMeasureNumber: number,
  targetBeat: number,
  altModifier = false,
): Promise<void> {
  const handleBox = await boundary.boundingBox();
  const targetMeasure = page.getByRole("region", { name: `Measure ${targetMeasureNumber}` });
  const gridBox = await targetMeasure.locator(".piano-roll-grid").boundingBox();
  if (!handleBox || !gridBox) throw new Error("Left-edge cancellation geometry is unavailable");
  const target = {
    x: gridBox.x + (targetBeat / 4) * gridBox.width,
    y: handleBox.y + handleBox.height / 2,
  };
  if (altModifier) await page.keyboard.down("Alt");
  try {
    await page.mouse.move(handleBox.x + handleBox.width / 2, target.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
  } finally {
    if (altModifier) await page.keyboard.up("Alt");
  }
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

test("Delete on a selected chord preserves its Rest interval, Melody and portable Ctrl+Z/Redo", async ({
  page,
}) => {
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture();
  await importProject(page, fixture);
  const guidesButton = page.getByRole("button", { name: "Guides" });
  if ((await guidesButton.getAttribute("aria-pressed")) !== "true") await guidesButton.click();
  await expect(guidesButton).toHaveAttribute("aria-pressed", "true");
  const before = await exportProjectText(page);
  const beforeProject = decodePortableProject(before);
  const chord = page.locator('.piano-roll-chord[data-source-step-id="generated-e"]').first();
  await chord.scrollIntoViewIfNeeded();
  const exactChordGuides = page.locator(
    '.piano-roll-grid.is-guides-on .piano-roll-guide-segment.is-chord-tone[data-source-step-id="generated-e"]',
  );
  await expect(exactChordGuides.first()).toBeVisible();
  await chord.click({ modifiers: ["Shift"] });
  await expect(chord).toHaveAttribute("aria-pressed", "true");
  await expect(chord).toBeFocused();
  await page.keyboard.press("Delete");
  await expect(chord).toBeFocused();

  const after = await exportProjectText(page);
  const afterProject = decodePortableProject(after);
  const rest = step(afterProject, "generated-e");
  expect(rest.kind).toBe("rest");
  if (rest.kind !== "rest") throw new Error("Delete removed the Step instead of making a Rest.");
  expect(rest.id).toBe(step(beforeProject, "generated-e").id);
  expect(rest.duration).toEqual(step(beforeProject, "generated-e").duration);
  expect(rest.melodyInstrumentOverride).toBe("flute");
  expect(rest.authoredMelody?.sourceRecipe).toEqual(
    step(beforeProject, "generated-e").kind === "chord" &&
      requireChord(step(beforeProject, "generated-e")).melody?.mode === "generated"
      ? generatedMelodyRecipe(requireChord(step(beforeProject, "generated-e")).melody)
      : undefined,
  );
  expect(fullMelodySignature(afterProject)).toEqual(fullMelodySignature(beforeProject));
  expect(stepStart(afterProject, "chord-f")).toEqual(stepStart(beforeProject, "chord-f"));
  expect(afterProject.progression.sections).toEqual(beforeProject.progression.sections);
  expect(afterProject.temporaryBranch).toEqual(beforeProject.temporaryBranch);
  const expectMutedRestGuides = async () => {
    const restGuides = page.locator(
      '.piano-roll-grid.is-guides-on .piano-roll-guide-segment.is-neutral.is-no-harmony[data-source-step-id="generated-e"]',
    );
    await expect(restGuides.first()).toBeVisible();
    await expect(
      page.locator(
        '.piano-roll-grid.is-guides-on .piano-roll-guide-segment.is-chord-tone[data-source-step-id="generated-e"]',
      ),
    ).toHaveCount(0);
    const palette = await restGuides.first().evaluate((element) => {
      const row = element.closest<HTMLElement>(".piano-roll-row");
      if (!row) throw new Error("Rest guide has no pitch row");
      const probe = document.createElement("span");
      probe.style.background = "var(--piano-roll-palette-surface)";
      row.append(probe);
      const surface = getComputedStyle(probe).backgroundColor;
      const restColor = getComputedStyle(element).backgroundColor;
      probe.remove();
      return {
        degrees: element.getAttribute("data-palette-degrees") ?? "",
        restColor,
        surface,
      };
    });
    expect(palette.degrees).not.toBe("");
    expect(palette.restColor).not.toBe(palette.surface);
    await expect(
      page.locator('.piano-roll-chord.is-rest[data-source-step-id="generated-e"]'),
    ).toContainText("Rest · no harmony");
  };
  await expectMutedRestGuides();

  await chord.focus();
  await page.keyboard.press("Control+z");
  await expect(
    page.locator('.piano-roll-chord[data-source-step-id="generated-e"]').first(),
  ).toBeFocused();
  await expect(exactChordGuides.first()).toBeVisible();
  expect(await exportProjectText(page)).toBe(before);
  await chord.focus();
  await page.keyboard.press("Control+y");
  await expect(
    page.locator('.piano-roll-chord[data-source-step-id="generated-e"]').first(),
  ).toBeFocused();
  await expectMutedRestGuides();
  expect(await exportProjectText(page)).toBe(after);

  for (const gridMode of ["Degrees", "Chromatic"] as const) {
    await page
      .getByRole("group", { name: "Pitch grid" })
      .getByRole("button", { name: gridMode, exact: true })
      .click();
    await expectMutedRestGuides();
    await page.setViewportSize({ width: 640, height: 360 });
    await page.locator(".piano-roll-measure").first().scrollIntoViewIfNeeded();
    for (const themeName of ["Dark", "Light"] as const) {
      await page
        .getByRole("group", { name: "Theme" })
        .getByRole("button", { name: `${themeName} theme` })
        .click();
      await page.screenshot({
        path: `test-results/chord-guides-rest-640x360-${gridMode.toLowerCase()}-${themeName.toLowerCase()}.png`,
      });
    }
  }

  const restProject = decodePortableProject(after);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });
  await importProject(page, restProject);
  const reloadedGuides = page.getByRole("button", { name: "Guides" });
  if ((await reloadedGuides.getAttribute("aria-pressed")) !== "true") await reloadedGuides.click();
  await expectMutedRestGuides();
});

test("Matrix replacement transfers its selected nonstandard variant onto an authored Rest", async ({
  page,
}) => {
  await openStudio(page);
  const variant: HarmonicVariant = Object.freeze<HarmonicVariant>({
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
  const fixture = withSameMeasureChordPair(createPianoRollSystemChordFixture());
  await importProject(page, fixture);
  const sourceChord = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
  await sourceChord.click();
  const boundary = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="right"]',
  );
  await expect(boundary).toBeVisible();
  const tripletTargets = [
    { snap: "1/1 triplet", expectedBoundary: rational(8, 3) },
    { snap: "1/2 triplet", expectedBoundary: rational(8, 3) },
    { snap: "1/4 triplet", expectedBoundary: rational(8, 3) },
    { snap: "1/8 triplet", expectedBoundary: rational(7, 3) },
    { snap: "1/16 triplet", expectedBoundary: rational(13, 6) },
  ] as const;

  for (const target of tripletTargets) {
    const before = await exportProjectText(page);
    await page.getByLabel("Snap resolution").selectOption(target.snap);
    const expectedBoundary = rationalToNumber(target.expectedBoundary);
    const preview = await dragBoundaryToBeat(page, boundary, 1, expectedBoundary);
    expect(preview).toBeCloseTo(expectedBoundary, 6);
    const after = await exportProjectText(page);
    const updated = decodePortableProject(after);
    expect(step(updated, "chord-a").duration.beats).toEqual(target.expectedBoundary);
    expect(step(updated, "chord-b").duration.beats).toEqual(
      subtractRational(rational(4), target.expectedBoundary),
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

test("pointer resize transfers a shared boundary both ways between identical chords", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStudio(page);
  const fixture = withSameMeasureChordPair(createPianoRollSystemChordFixture());
  await importProject(page, fixture);
  const beforeExpansion = await exportProjectText(page);
  const sourceChord = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
  await sourceChord.click();
  await page.getByLabel("Snap resolution").selectOption("1/8 triplet");
  const boundary = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="right"]',
  );
  const forwardPreview = await dragBoundaryToBeat(page, boundary, 1, 8 / 3);
  expect(forwardPreview).toBeCloseTo(8 / 3, 6);
  const afterExpansion = await exportProjectText(page);
  await expectUndoRedoBytes(page, beforeExpansion, afterExpansion);

  const beforeReverse = await exportProjectText(page);
  const reversePreview = await dragBoundaryToBeat(page, boundary, 1, 4 / 3);
  expect(reversePreview).toBeCloseTo(4 / 3, 6);
  const afterReverse = await exportProjectText(page);
  const beforeProject = decodePortableProject(beforeExpansion);
  const afterProject = decodePortableProject(afterReverse);
  expect(step(afterProject, "chord-a").duration.beats).toEqual(rational(4, 3));
  expect(step(afterProject, "chord-b").duration.beats).toEqual(rational(8, 3));
  expect(afterProject.progression.steps.map((candidate) => candidate.id)).not.toContain(
    "resize-gap:chord-a:chord-b",
  );
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

test("normal pointer resize transfers exact time between different same-measure chords on both edges", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installControlledAudioClock(page);
  await openStudio(page);

  const cases = [
    { selectedId: "chord-a", edge: "right" as const, boundary: 3, leftDuration: rational(3) },
    { selectedId: "chord-a", edge: "right" as const, boundary: 1, leftDuration: rational(1) },
    { selectedId: "chord-b", edge: "left" as const, boundary: 1, leftDuration: rational(1) },
    { selectedId: "chord-b", edge: "left" as const, boundary: 3, leftDuration: rational(3) },
  ];
  for (const [index, scenario] of cases.entries()) {
    const fixture = withDifferentSameMeasureChordPair(
      createPianoRollSystemChordFixture(`different-harmony-boundary-${index}`),
    );
    await importProject(page, fixture);
    await page.getByLabel("Snap resolution").selectOption("1/16");
    const before = await exportProjectText(page);
    const selected = page
      .locator(`.piano-roll-chord[data-source-step-id="${scenario.selectedId}"]`)
      .first();
    await selected.click();
    const handle = page.locator(
      `.piano-roll-chord-boundary-handle[data-boundary-step-id="${scenario.selectedId}"][data-boundary-edge="${scenario.edge}"]`,
    );
    if (index === 0) {
      await cancelBoundaryDragToBeat(page, handle, 1, scenario.boundary);
      expect(await exportProjectText(page)).toBe(before);
    }
    if (index === 0) await installAudioScheduleCapture(page);
    expect(await dragBoundaryToBeat(page, handle, 1, scenario.boundary)).toBeCloseTo(
      scenario.boundary,
      6,
    );
    const afterText = await exportProjectText(page);
    const updated = decodePortableProject(afterText);
    expect(step(updated, "chord-a").duration.beats).toEqual(scenario.leftDuration);
    expect(step(updated, "chord-b").duration.beats).toEqual(
      subtractRational(rational(4), scenario.leftDuration),
    );
    expect(stepStart(updated, "chord-b")).toEqual(scenario.leftDuration);
    expect(stepStart(updated, "chord-c")).toEqual(rational(8));
    expect(sumDuration(updated)).toEqual(sumDuration(fixture));
    for (const id of ["chord-a", "chord-b"] as const) {
      expect(requireChord(step(updated, id)).harmonicFunction).toEqual(
        requireChord(step(fixture, id)).harmonicFunction,
      );
      expect(requireChord(step(updated, id)).harmonicVariant).toEqual(
        requireChord(step(fixture, id)).harmonicVariant,
      );
      expect(step(updated, id).id).toBe(step(fixture, id).id);
    }
    expect(
      melodySignature(updated, new Set(fixture.progression.steps.map((candidate) => candidate.id))),
    ).toEqual(
      melodySignature(fixture, new Set(fixture.progression.steps.map((candidate) => candidate.id))),
    );
    expect(updated.progression.sections).toEqual(fixture.progression.sections);
    expect(updated.progression.loopRegion).toEqual(fixture.progression.loopRegion);
    expect(updated.temporaryBranch).toEqual(fixture.temporaryBranch);
    await expectUndoRedoBytes(page, before, afterText);
    if (index === 0) {
      const events = await playAndCaptureAudioEvents(page);
      const harmony = events.filter(
        (event) => event.channelRole === "upper" || event.channelRole === "bass",
      );
      const firstAttack = Math.min(
        ...harmony.filter((event) => event.stepIndex === 0).map((event) => event.startSeconds),
      );
      const expectedNeighborAttack =
        firstAttack +
        rationalToNumber(scenario.leftDuration) * (60 / fixture.globalTiming.tempoBpm);
      expect(
        harmony.some(
          (event) =>
            event.stepIndex === 1 && Math.abs(event.startSeconds - expectedNeighborAttack) < 1e-6,
        ),
      ).toBe(true);
      await page
        .getByRole("group", { name: "Progression playback controls" })
        .getByRole("button", { name: "Stop" })
        .click();
    }
  }
});

test("normal resize fully consumes a different same-measure chord from either edge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installControlledAudioClock(page);
  await openStudio(page);

  const scenarios = [
    {
      draggedId: "chord-a",
      edge: "right" as const,
      boundary: 4,
      retainedId: "chord-a",
      removedId: "chord-b",
    },
    {
      draggedId: "chord-b",
      edge: "left" as const,
      boundary: 0,
      retainedId: "chord-b",
      removedId: "chord-a",
    },
  ];
  for (const [index, scenario] of scenarios.entries()) {
    const fixture = withDistinctChordResizeParameters(
      withDifferentSameMeasureChordPair(
        createPianoRollSystemChordFixture(`different-harmony-full-consumption-${index}`),
      ),
    );
    await importProject(page, fixture);
    await page.getByLabel("Snap resolution").selectOption("1/16");
    const before = await exportProjectText(page);
    const dragged = step(fixture, scenario.draggedId);
    if (dragged.kind !== "chord") throw new Error("The dragged fixture Step must be a chord");
    const selected = page
      .locator(`.piano-roll-chord[data-source-step-id="${scenario.draggedId}"]`)
      .first();
    await installAudioScheduleCapture(page);
    await selected.click();
    const handle = page.locator(
      `.piano-roll-chord-boundary-handle[data-boundary-step-id="${scenario.draggedId}"][data-boundary-edge="${scenario.edge}"]`,
    );
    if (scenario.edge === "right") await expect(handle).toHaveAttribute("aria-valuemax", "4");
    else await expect(handle).toHaveAttribute("aria-valuemin", "0");
    await cancelBoundaryDragToBeat(page, handle, 1, scenario.boundary);
    expect(await exportProjectText(page)).toBe(before);
    await clearCapturedAudioEvents(page);
    expect(await dragBoundaryToBeat(page, handle, 1, scenario.boundary)).toBeCloseTo(
      scenario.boundary,
      6,
    );
    expect(await capturedAudioEvents(page)).toEqual([]);
    const after = await exportProjectText(page);
    const merged = decodePortableProject(after);
    expect(merged.progression.steps.map((candidate) => candidate.id)).not.toContain(
      scenario.removedId,
    );
    const retained = step(merged, scenario.retainedId);
    expect(retained.kind).toBe("chord");
    if (retained.kind !== "chord") throw new Error("The retained Step must remain a chord");
    expect(retained.duration.beats).toEqual(rational(4));
    expect(retained.harmonicFunction).toEqual(dragged.harmonicFunction);
    expect(retained.harmonicVariant).toEqual(dragged.harmonicVariant);
    expect(retained.performance).toEqual(dragged.performance);
    expect(retained.melodyInstrumentOverride).toBe(dragged.melodyInstrumentOverride);
    expect(retained.cardView).toBe(dragged.cardView);
    expect(stepStart(merged, scenario.retainedId)).toEqual(rational(0));
    expect(stepStart(merged, "chord-c")).toEqual(rational(8));
    expect(sumDuration(merged)).toEqual(sumDuration(fixture));
    expect(fullMelodySignature(merged)).toEqual(fullMelodySignature(fixture));
    expect(merged.progression.sections).toEqual(
      fixture.progression.sections?.map((section) =>
        section.startStepId === scenario.removedId
          ? { ...section, startStepId: scenario.retainedId }
          : section,
      ),
    );
    expect(merged.temporaryBranch?.originStepId).toBe(
      scenario.draggedId === "chord-a" ? "chord-a" : "chord-b",
    );
    await page.screenshot({
      path: `test-results/chord-different-full-consumption-${scenario.edge}-1280x900.png`,
    });
    await expectUndoRedoBytes(page, before, after);

    const audio = await playAndCaptureAudioEvents(page);
    const harmony = audio.filter(
      (event) => event.channelRole === "upper" || event.channelRole === "bass",
    );
    expect(harmony.some((event) => event.stepIndex === 1)).toBe(false);
    await page
      .getByRole("group", { name: "Progression playback controls" })
      .getByRole("button", { name: "Stop" })
      .click();
  }
});

test("Alt pointer shrink isolates the selected chord and Alt+Arrow offers the keyboard path", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installControlledAudioClock(page);
  await openStudio(page);

  for (const leftEdge of [false, true]) {
    const fixture = withDifferentSameMeasureChordPair(
      createPianoRollSystemChordFixture(`isolated-alt-shrink-${leftEdge ? "left" : "right"}`),
    );
    await importProject(page, fixture);
    await page.getByLabel("Snap resolution").selectOption("1/16");
    const before = await exportProjectText(page);
    const selectedId = leftEdge ? "chord-b" : "chord-a";
    const edge = leftEdge ? "left" : "right";
    const selected = page.locator(`.piano-roll-chord[data-source-step-id="${selectedId}"]`).first();
    await selected.click();
    const handle = page.locator(
      `.piano-roll-chord-boundary-handle[data-boundary-step-id="${selectedId}"][data-boundary-edge="${edge}"]`,
    );
    await expect(handle).toHaveAttribute("title", /Hold Alt while dragging/);
    if (!leftEdge) {
      await cancelBoundaryDragToBeat(page, handle, 1, 1.5, true);
      expect(await exportProjectText(page)).toBe(before);
      await installAudioScheduleCapture(page);
    }
    const target = leftEdge ? 3 : 1.5;
    expect(await dragBoundaryToBeat(page, handle, 1, target, true)).toBeCloseTo(target, 6);
    const afterText = await exportProjectText(page);
    const updated = decodePortableProject(afterText);
    const gap = step(updated, `resize-gap:chord-a:chord-b`);
    expect(gap.kind).toBe("rest");
    expect(gap.duration.beats).toEqual(leftEdge ? rational(1) : rational(1, 2));
    expect(step(updated, "chord-a").duration.beats).toEqual(
      leftEdge ? rational(2) : rational(3, 2),
    );
    expect(step(updated, "chord-b").duration.beats).toEqual(leftEdge ? rational(1) : rational(2));
    expect(stepStart(updated, "chord-b")).toEqual(leftEdge ? rational(3) : rational(2));
    expect(stepStart(updated, "chord-c")).toEqual(rational(8));
    expect(sumDuration(updated)).toEqual(sumDuration(fixture));
    expect(fullMelodySignature(updated)).toEqual(fullMelodySignature(fixture));
    expect(requireChord(step(updated, "chord-a")).harmonicFunction).toEqual(
      requireChord(step(fixture, "chord-a")).harmonicFunction,
    );
    expect(requireChord(step(updated, "chord-b")).harmonicFunction).toEqual(
      requireChord(step(fixture, "chord-b")).harmonicFunction,
    );
    if (!leftEdge) expect(await capturedAudioEvents(page)).toEqual([]);
    await page.screenshot({
      path: `test-results/chord-alt-${edge}-shrink-rest-1280x900.png`,
    });
    await expectUndoRedoBytes(page, before, afterText);
  }

  const keyboardFixture = withDifferentSameMeasureChordPair(
    createPianoRollSystemChordFixture("isolated-alt-keyboard-shrink"),
  );
  await importProject(page, keyboardFixture);
  await page.getByLabel("Snap resolution").selectOption("1/16");
  const beforeKeyboard = await exportProjectText(page);
  const chordB = page.locator('.piano-roll-chord[data-source-step-id="chord-b"]').first();
  await chordB.click();
  const leftHandle = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-b"][data-boundary-edge="left"]',
  );
  await leftHandle.focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(leftHandle).toHaveAttribute("aria-valuenow", "2.25");
  await expect(leftHandle).toHaveAttribute("aria-valuetext", /Alt isolated mode/);
  await page.keyboard.press("Escape");
  expect(await exportProjectText(page)).toBe(beforeKeyboard);

  await leftHandle.focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(leftHandle).toHaveAttribute("aria-valuenow", "2.25");
  await page.keyboard.press("Enter");
  const afterKeyboardText = await exportProjectText(page);
  const keyboardUpdated = decodePortableProject(afterKeyboardText);
  expect(step(keyboardUpdated, "resize-gap:chord-a:chord-b").duration.beats).toEqual(
    rational(1, 4),
  );
  expect(step(keyboardUpdated, "chord-a").duration.beats).toEqual(rational(2));
  expect(step(keyboardUpdated, "chord-b").duration.beats).toEqual(rational(7, 4));
  expect(stepStart(keyboardUpdated, "chord-b")).toEqual(rational(9, 4));
  await expectUndoRedoBytes(page, beforeKeyboard, afterKeyboardText);
});

test("pointer shrink on either edge leaves a Rest and keeps absolute chord onsets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installControlledAudioClock(page);
  await openStudio(page);

  const rightFixture = withSameMeasureChordRestPair(
    createPianoRollSystemChordFixture("right-edge-rest-shrink"),
  );
  await importProject(page, rightFixture);
  await page.getByLabel("Snap resolution").selectOption("1/16");
  const rightBefore = await exportProjectText(page);
  const chordA = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
  await chordA.click();
  const rightHandle = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="right"]',
  );
  await cancelBoundaryDragToBeat(page, rightHandle, 1, 1.5);
  expect(await exportProjectText(page)).toBe(rightBefore);
  expect(await dragBoundaryToBeat(page, rightHandle, 1, 1.5)).toBeCloseTo(1.5, 6);
  const rightAfterText = await exportProjectText(page);
  const rightAfter = decodePortableProject(rightAfterText);
  expect(step(rightAfter, "chord-a").duration.beats).toEqual(rational(3, 2));
  expect(step(rightAfter, "rest-d").duration.beats).toEqual(rational(5, 2));
  expect(stepStart(rightAfter, "chord-b")).toEqual(rational(4));
  expect(sumDuration(rightAfter)).toEqual(sumDuration(rightFixture));
  expect(
    melodySignature(
      rightAfter,
      new Set(rightFixture.progression.steps.map((candidate) => candidate.id)),
    ),
  ).toEqual(
    melodySignature(
      rightFixture,
      new Set(rightFixture.progression.steps.map((candidate) => candidate.id)),
    ),
  );
  await page.screenshot({ path: "test-results/chord-right-edge-shrink-rest-1280x900.png" });
  await expectUndoRedoBytes(page, rightBefore, rightAfterText);
  const rightEvents = await playAndCaptureAudioEvents(page);
  const rightHarmony = rightEvents.filter(
    (event) => event.channelRole === "upper" || event.channelRole === "bass",
  );
  const rightChordStart = Math.min(
    ...rightHarmony.filter((event) => event.stepIndex === 2).map((event) => event.startSeconds),
  );
  const restGapOnset = rightChordStart - (2.5 * 60) / rightFixture.globalTiming.tempoBpm;
  expect(rightHarmony.some((event) => Math.abs(event.startSeconds - restGapOnset) < 1e-6)).toBe(
    false,
  );
  await page
    .getByRole("group", { name: "Progression playback controls" })
    .getByRole("button", { name: "Stop" })
    .click();

  const leftFixture = withSameMeasureChordRestPair(
    createPianoRollSystemChordFixture("left-edge-rest-shrink"),
    true,
  );
  await importProject(page, leftFixture);
  await page.getByLabel("Snap resolution").selectOption("1/16");
  const leftBefore = await exportProjectText(page);
  const leftChordA = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
  await leftChordA.click();
  const leftHandle = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="left"]',
  );
  await cancelBoundaryDragToBeat(page, leftHandle, 1, 3);
  expect(await exportProjectText(page)).toBe(leftBefore);
  expect(await dragBoundaryToBeat(page, leftHandle, 1, 3)).toBeCloseTo(3, 6);
  const leftAfterText = await exportProjectText(page);
  const leftAfter = decodePortableProject(leftAfterText);
  expect(step(leftAfter, "rest-d").duration.beats).toEqual(rational(3));
  expect(step(leftAfter, "chord-a").duration.beats).toEqual(rational(1));
  expect(stepStart(leftAfter, "chord-a")).toEqual(rational(3));
  expect(stepStart(leftAfter, "chord-b")).toEqual(rational(4));
  expect(sumDuration(leftAfter)).toEqual(sumDuration(leftFixture));
  expect(
    melodySignature(
      leftAfter,
      new Set(leftFixture.progression.steps.map((candidate) => candidate.id)),
    ),
  ).toEqual(
    melodySignature(
      leftFixture,
      new Set(leftFixture.progression.steps.map((candidate) => candidate.id)),
    ),
  );
  await page.screenshot({ path: "test-results/chord-left-edge-shrink-rest-1280x900.png" });
  await expectUndoRedoBytes(page, leftBefore, leftAfterText);
  const leftEvents = await playAndCaptureAudioEvents(page);
  const leftHarmony = leftEvents.filter(
    (event) => event.channelRole === "upper" || event.channelRole === "bass",
  );
  const selectedChordStart = Math.min(
    ...leftHarmony.filter((event) => event.stepIndex === 1).map((event) => event.startSeconds),
  );
  const followingChordStart = Math.min(
    ...leftHarmony.filter((event) => event.stepIndex === 2).map((event) => event.startSeconds),
  );
  expect(followingChordStart - selectedChordStart).toBeCloseTo(
    60 / leftFixture.globalTiming.tempoBpm,
    6,
  );
  await page
    .getByRole("group", { name: "Progression playback controls" })
    .getByRole("button", { name: "Stop" })
    .click();
});

test("pointer extension consumes only a same-measure Rest from either edge", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installControlledAudioClock(page);
  await openStudio(page);

  for (const restFirst of [false, true]) {
    const fixture = withSameMeasureChordRestPair(
      createPianoRollSystemChordFixture(`edge-rest-extension-${restFirst ? "left" : "right"}`),
      restFirst,
    );
    await importProject(page, fixture);
    await page.getByLabel("Snap resolution").selectOption("1/16");
    const before = await exportProjectText(page);
    const chordA = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
    await chordA.click();
    const edge = restFirst ? "left" : "right";
    const handle = page.locator(
      `.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="${edge}"]`,
    );
    const partialTarget = restFirst ? 1 : 3;
    expect(await dragBoundaryToBeat(page, handle, 1, partialTarget)).toBeCloseTo(partialTarget, 6);
    const partialText = await exportProjectText(page);
    const partial = decodePortableProject(partialText);
    expect(step(partial, "rest-d").duration.beats).toEqual(rational(1));
    expect(step(partial, "chord-a").duration.beats).toEqual(rational(3));
    expect(stepStart(partial, "chord-a")).toEqual(restFirst ? rational(1) : rational(0));
    expect(stepStart(partial, "chord-b")).toEqual(rational(4));
    expect(sumDuration(partial)).toEqual(sumDuration(fixture));
    expect(
      melodySignature(partial, new Set(fixture.progression.steps.map((candidate) => candidate.id))),
    ).toEqual(
      melodySignature(fixture, new Set(fixture.progression.steps.map((candidate) => candidate.id))),
    );
    await expectUndoRedoBytes(page, before, partialText);

    await historyAction(page, "Undo");
    expect(await exportProjectText(page)).toBe(before);
    const fullTarget = restFirst ? 0 : 4;
    expect(await dragBoundaryToBeat(page, handle, 1, fullTarget)).toBeCloseTo(fullTarget, 6);
    const fullText = await exportProjectText(page);
    const full = decodePortableProject(fullText);
    expect(full.progression.steps.map((candidate) => candidate.id)).not.toContain("rest-d");
    expect(step(full, "chord-a").duration.beats).toEqual(rational(4));
    expect(stepStart(full, "chord-a")).toEqual(rational(0));
    expect(stepStart(full, "chord-b")).toEqual(rational(4));
    expect(sumDuration(full)).toEqual(sumDuration(fixture));
    expect(
      melodySignature(full, new Set(fixture.progression.steps.map((candidate) => candidate.id))),
    ).toEqual(
      melodySignature(fixture, new Set(fixture.progression.steps.map((candidate) => candidate.id))),
    );
    expect(full.progression.sections?.map((section) => section.id)).toEqual(
      fixture.progression.sections?.map((section) => section.id),
    );
    expect(full.progression.sections?.[0]?.startStepId).toBe("chord-a");
    expect(full.progression.loopRegion?.startStepId).toBe(
      fixture.progression.loopRegion?.startStepId,
    );
    expect(full.temporaryBranch?.originStepId).toBe(fixture.temporaryBranch?.originStepId);
    await page.screenshot({
      path: `test-results/chord-${edge}-edge-rest-full-extension-1280x900.png`,
    });
    await expectUndoRedoBytes(page, before, fullText);

    const events = await playAndCaptureAudioEvents(page);
    const harmony = events.filter(
      (event) => event.channelRole === "upper" || event.channelRole === "bass",
    );
    const start = Math.min(
      ...harmony.filter((event) => event.stepIndex === 0).map((event) => event.startSeconds),
    );
    expect(harmony.some((event) => Math.abs(event.startSeconds - (start + 1)) < 1e-6)).toBe(false);
    await page
      .getByRole("group", { name: "Progression playback controls" })
      .getByRole("button", { name: "Stop" })
      .click();
  }
});

test("left edge can shrink into a leading-measure Rest and expand back to the barline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStudio(page);
  const fixture = withFirstMeasureRest(
    createPianoRollSystemChordFixture("cross-measure-left-rest"),
  );
  await importProject(page, fixture);
  await page.getByLabel("Snap resolution").selectOption("1/16");
  const before = await exportProjectText(page);
  const initial = decodePortableProject(before);
  expect(initial.progression.steps[0]).toMatchObject({
    kind: "rest",
    duration: { beats: rational(4) },
  });
  expect(stepStart(initial, "chord-a")).toEqual(rational(4));
  expect(step(initial, "chord-a").duration.beats).toEqual(rational(4));
  const chordA = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
  await chordA.scrollIntoViewIfNeeded();
  await chordA.click();
  const leftHandle = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="left"]',
  );
  await expect(leftHandle).toBeVisible();
  expect(Number(await leftHandle.getAttribute("aria-valuemin"))).toBeCloseTo(4, 6);
  expect(await dragBoundaryToBeat(page, leftHandle, 2, 6)).toBeCloseTo(6, 6);
  const shrunkText = await exportProjectText(page);
  const shrunk = decodePortableProject(shrunkText);
  expect(step(shrunk, "rest-d").duration.beats).toEqual(rational(6));
  expect(step(shrunk, "chord-a").duration.beats).toEqual(rational(2));
  expect(stepStart(shrunk, "chord-a")).toEqual(rational(6));
  expect(stepStart(shrunk, "chord-b")).toEqual(rational(8));
  expect(sumDuration(shrunk)).toEqual(sumDuration(fixture));
  expect(
    melodySignature(shrunk, new Set(fixture.progression.steps.map((candidate) => candidate.id))),
  ).toEqual(
    melodySignature(fixture, new Set(fixture.progression.steps.map((candidate) => candidate.id))),
  );
  expect(shrunk.progression.sections).toEqual(fixture.progression.sections);
  expect(shrunk.progression.loopRegion).toEqual(fixture.progression.loopRegion);
  expect(shrunk.temporaryBranch).toEqual(fixture.temporaryBranch);
  await page.screenshot({ path: "test-results/chord-left-shrink-leading-rest-1280x900.png" });
  await expectUndoRedoBytes(page, before, shrunkText);

  await expect(leftHandle).toBeVisible();
  expect(await leftHandle.evaluate((element) => getComputedStyle(element).cursor)).toBe(
    "ew-resize",
  );
  const beforeReExpansion = await exportProjectText(page);
  expect(Number(await leftHandle.getAttribute("aria-valuemin"))).toBeCloseTo(4, 6);
  expect(await dragBoundaryToBeat(page, leftHandle, 2, 4)).toBeCloseTo(4, 6);
  const restoredText = await exportProjectText(page);
  const restored = decodePortableProject(restoredText);
  expect(step(restored, "rest-d").duration.beats).toEqual(rational(4));
  expect(step(restored, "chord-a").duration.beats).toEqual(rational(4));
  expect(stepStart(restored, "chord-a")).toEqual(rational(4));
  expect(stepStart(restored, "chord-b")).toEqual(rational(8));
  expect(sumDuration(restored)).toEqual(sumDuration(fixture));
  expect(
    melodySignature(restored, new Set(fixture.progression.steps.map((candidate) => candidate.id))),
  ).toEqual(
    melodySignature(fixture, new Set(fixture.progression.steps.map((candidate) => candidate.id))),
  );
  expect(restored.progression.sections).toEqual(fixture.progression.sections);
  expect(restored.progression.loopRegion).toEqual(fixture.progression.loopRegion);
  expect(restored.temporaryBranch).toEqual(fixture.temporaryBranch);
  await page.screenshot({ path: "test-results/chord-left-reexpanded-to-barline-1280x900.png" });
  await expectUndoRedoBytes(page, beforeReExpansion, restoredText);
});

test("restores a second-measure chord's left edge in a two-step progression", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStudio(page);
  const fixture = withFirstMeasureRest(
    createPianoRollSystemChordFixture("two-measure-leading-rest-resize"),
  );
  const [firstMeasureRest, secondMeasureChord] = fixture.progression.steps;
  if (
    !firstMeasureRest ||
    firstMeasureRest.kind !== "rest" ||
    !secondMeasureChord ||
    secondMeasureChord.kind !== "chord"
  )
    throw new Error("The fixture needs a leading Rest followed by a chord");
  const { loopRegion: _loopRegion, ...progressionWithoutLoop } = fixture.progression;
  const { temporaryBranch: _temporaryBranch, ...fixtureWithoutBranch } = fixture;
  const twoMeasureProject: Project = Object.freeze({
    ...fixtureWithoutBranch,
    progression: Object.freeze({
      ...progressionWithoutLoop,
      steps: Object.freeze([firstMeasureRest, secondMeasureChord]),
      selectedStepId: secondMeasureChord.id,
      sections: Object.freeze([
        Object.freeze({ id: "opening", name: "Opening", startStepId: firstMeasureRest.id }),
      ]),
    }),
  });
  await importProject(page, twoMeasureProject);
  await page.getByLabel("Snap resolution").selectOption("1/4");
  const before = await exportProjectText(page);
  const initial = decodePortableProject(before);
  expect(initial.progression.steps).toHaveLength(2);
  expect(step(initial, firstMeasureRest.id).duration.beats).toEqual(rational(4));
  expect(stepStart(initial, secondMeasureChord.id)).toEqual(rational(4));
  expect(step(initial, secondMeasureChord.id).duration.beats).toEqual(rational(4));

  await page.locator(`.piano-roll-chord[data-source-step-id="${secondMeasureChord.id}"]`).click();
  const leftHandle = page.locator(
    `.piano-roll-chord-boundary-handle[data-boundary-step-id="${secondMeasureChord.id}"][data-boundary-edge="left"]`,
  );
  await expect(leftHandle).toBeVisible();
  expect(await dragBoundaryToBeat(page, leftHandle, 2, 5)).toBeCloseTo(5, 6);
  const shrunkText = await exportProjectText(page);
  const shrunk = decodePortableProject(shrunkText);
  expect(step(shrunk, firstMeasureRest.id).duration.beats).toEqual(rational(5));
  expect(step(shrunk, secondMeasureChord.id).duration.beats).toEqual(rational(3));
  expect(stepStart(shrunk, secondMeasureChord.id)).toEqual(rational(5));
  expect(sumDuration(shrunk)).toEqual(rational(8));
  await expectUndoRedoBytes(page, before, shrunkText);

  await expect(leftHandle).toBeVisible();
  expect(Number(await leftHandle.getAttribute("aria-valuemin"))).toBeCloseTo(4, 6);
  expect(await dragBoundaryToBeat(page, leftHandle, 2, 4)).toBeCloseTo(4, 6);
  const restoredText = await exportProjectText(page);
  const restored = decodePortableProject(restoredText);
  expect(step(restored, firstMeasureRest.id).duration.beats).toEqual(rational(4));
  expect(step(restored, secondMeasureChord.id).duration.beats).toEqual(rational(4));
  expect(stepStart(restored, secondMeasureChord.id)).toEqual(rational(4));
  expect(sumDuration(restored)).toEqual(rational(8));
  await expectUndoRedoBytes(page, shrunkText, restoredText);
});

test("first and final chord edges create leading and trailing Rest gaps", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStudio(page);
  const fixture = createPianoRollSystemChordFixture("edge-project-bounds");
  await importProject(page, fixture);
  await page.getByLabel("Snap resolution").selectOption("1/16");

  const beforeLeading = await exportProjectText(page);
  const first = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
  await first.click();
  const leadingHandle = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="left"]',
  );
  expect(await dragBoundaryToBeat(page, leadingHandle, 1, 1)).toBeCloseTo(1, 6);
  const leadingText = await exportProjectText(page);
  const leading = decodePortableProject(leadingText);
  expect(leading.progression.steps[0]?.kind).toBe("rest");
  expect(leading.progression.steps[0]?.duration.beats).toEqual(rational(1));
  expect(step(leading, "chord-a").duration.beats).toEqual(rational(3));
  expect(stepStart(leading, "chord-b")).toEqual(rational(4));
  expect(sumDuration(leading)).toEqual(sumDuration(fixture));
  await expectUndoRedoBytes(page, beforeLeading, leadingText);

  await historyAction(page, "Undo");
  expect(await exportProjectText(page)).toBe(beforeLeading);
  const last = page.locator('.piano-roll-chord[data-source-step-id="chord-f"]').last();
  await last.scrollIntoViewIfNeeded();
  await last.click();
  const trailingHandle = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-f"][data-boundary-edge="right"]',
  );
  expect(await dragBoundaryToBeat(page, trailingHandle, 6, 23)).toBeCloseTo(23, 6);
  const trailingText = await exportProjectText(page);
  const trailing = decodePortableProject(trailingText);
  expect(step(trailing, "chord-f").duration.beats).toEqual(rational(3));
  expect(trailing.progression.steps.at(-1)?.kind).toBe("rest");
  expect(trailing.progression.steps.at(-1)?.duration.beats).toEqual(rational(1));
  expect(sumDuration(trailing)).toEqual(sumDuration(fixture));
  await page.screenshot({ path: "test-results/chord-final-right-edge-trailing-rest-1280x900.png" });
  await expectUndoRedoBytes(page, beforeLeading, trailingText);
});

test("pointer resize consumes a same-measure Rest or identical chord without shifting the timeline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installControlledAudioClock(page);
  await openStudio(page);
  const fixture = withSameMeasureChordPair(createPianoRollSystemChordFixture());
  await importProject(page, fixture);
  await page.getByLabel("Snap resolution").selectOption("1/16");
  const chordA = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
  await chordA.click();
  const beforePartial = await exportProjectText(page);
  const rightHandle = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="right"]',
  );
  expect(await dragBoundaryToBeat(page, rightHandle, 1, 3)).toBeCloseTo(3, 6);
  const partial = decodePortableProject(await exportProjectText(page));
  expect(step(partial, "chord-a").duration.beats).toEqual(rational(3));
  expect(step(partial, "chord-b").duration.beats).toEqual(rational(1));
  expect(stepStart(partial, "chord-c")).toEqual(rational(8));
  expect(sumDuration(partial)).toEqual(sumDuration(fixture));

  const partialEvents = await playAndCaptureAudioEvents(page);
  const partialHarmony = partialEvents.filter(
    (event) => event.channelRole === "upper" || event.channelRole === "bass",
  );
  const firstChordAttack = Math.min(
    ...partialHarmony.filter((event) => event.stepIndex === 0).map((event) => event.startSeconds),
  );
  const expectedBoundaryAttack = firstChordAttack + (3 * 60) / fixture.globalTiming.tempoBpm;
  expect(
    partialHarmony.some(
      (event) =>
        event.stepIndex === 1 && Math.abs(event.startSeconds - expectedBoundaryAttack) < 1e-6,
    ),
  ).toBe(true);
  await page
    .getByRole("group", { name: "Progression playback controls" })
    .getByRole("button", { name: "Stop" })
    .click();
  await expectUndoRedoBytes(page, beforePartial, await exportProjectText(page));
  await historyAction(page, "Undo");
  expect(await exportProjectText(page)).toBe(beforePartial);

  const beforeLeftRetainedMerge = await exportProjectText(page);
  await chordA.click();
  expect(await dragBoundaryToBeat(page, rightHandle, 1, 3.9)).toBeCloseTo(4, 6);
  const mergedLeftText = await exportProjectText(page);
  const mergedLeft = decodePortableProject(mergedLeftText);
  expect(mergedLeft.progression.steps.map((candidate) => candidate.id)).not.toContain("chord-b");
  expect(step(mergedLeft, "chord-a").duration.beats).toEqual(rational(4));
  expect(stepStart(mergedLeft, "chord-c")).toEqual(rational(8));
  expect(sumDuration(mergedLeft)).toEqual(sumDuration(fixture));
  expect(
    melodySignature(
      mergedLeft,
      new Set(fixture.progression.steps.map((candidate) => candidate.id)),
    ),
  ).toEqual(
    melodySignature(fixture, new Set(fixture.progression.steps.map((candidate) => candidate.id))),
  );
  await page.screenshot({
    path: "test-results/chord-identical-full-merge-retained-left-1280x900.png",
  });
  await expectUndoRedoBytes(page, beforeLeftRetainedMerge, mergedLeftText);
  const leftEvents = await playAndCaptureAudioEvents(page);
  const leftHarmony = leftEvents.filter(
    (event) => event.channelRole === "upper" || event.channelRole === "bass",
  );
  const mergedStart = Math.min(
    ...leftHarmony.filter((event) => event.stepIndex === 0).map((event) => event.startSeconds),
  );
  expect(leftHarmony.some((event) => Math.abs(event.startSeconds - (mergedStart + 2)) < 1e-6)).toBe(
    false,
  );
  const chordCAudioIndex = mergedLeft.progression.steps.findIndex(
    (candidate) => candidate.id === "chord-c",
  );
  expect(chordCAudioIndex).toBeGreaterThanOrEqual(0);
  expect(
    leftHarmony.some(
      (event) =>
        event.stepIndex === chordCAudioIndex &&
        event.startSeconds >= mergedStart + (4 * 60) / fixture.globalTiming.tempoBpm,
    ),
  ).toBe(true);
  await page
    .getByRole("group", { name: "Progression playback controls" })
    .getByRole("button", { name: "Stop" })
    .click();
  await historyAction(page, "Undo");
  expect(await exportProjectText(page)).toBe(beforeLeftRetainedMerge);

  const chordB = page.locator('.piano-roll-chord[data-source-step-id="chord-b"]').first();
  await chordB.click();
  const leftHandle = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-b"][data-boundary-edge="left"]',
  );
  expect(await dragBoundaryToBeat(page, leftHandle, 1, 0.1)).toBeCloseTo(0, 6);
  const mergedRightText = await exportProjectText(page);
  const mergedRight = decodePortableProject(mergedRightText);
  expect(mergedRight.progression.steps.map((candidate) => candidate.id)).not.toContain("chord-a");
  expect(step(mergedRight, "chord-b").duration.beats).toEqual(rational(4));
  expect(stepStart(mergedRight, "chord-c")).toEqual(rational(8));
  expect(sumDuration(mergedRight)).toEqual(sumDuration(fixture));
  await page.screenshot({
    path: "test-results/chord-identical-full-merge-retained-right-1280x900.png",
  });
  await expectUndoRedoBytes(page, beforeLeftRetainedMerge, mergedRightText);
});

test("Tie fills a same-measure Rest with the chord, preserving notes, sections, audio and history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installControlledAudioClock(page);
  await openStudio(page);
  for (const restFirst of [false, true]) {
    const fixture = withSameMeasureChordRestPair(
      createPianoRollSystemChordFixture(
        `tie-chord-rest-${restFirst ? "rest-first" : "chord-first"}`,
      ),
      restFirst,
    );
    await importProject(page, fixture);
    const before = await exportProjectText(page);
    const original = decodePortableProject(before);
    const originalMelody = melodySignature(
      original,
      new Set(original.progression.steps.map((candidate) => candidate.id)),
    );
    const chordA = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
    const rest = page.locator('.piano-roll-chord[data-source-step-id="rest-d"]').first();
    await chordA.click();
    await rest.click({ modifiers: ["Shift"] });
    const panel = page.getByTestId("piano-roll-system-chord-panel-0");
    const tieButton = panel.getByRole("button", { name: "Tie", exact: true });
    await expect(tieButton).toBeEnabled();
    expect(await exportProjectText(page)).toBe(before);
    await tieButton.click();
    const afterTie = await exportProjectText(page);
    const tiedProject = decodePortableProject(afterTie);
    expect(tiedProject.progression.steps.map((candidate) => candidate.id)).not.toContain("rest-d");
    expect(step(tiedProject, "chord-a").duration.beats).toEqual(rational(4));
    expect(stepStart(tiedProject, "chord-b")).toEqual(rational(4));
    expect(sumDuration(tiedProject)).toEqual(sumDuration(original));
    expect(tiedProject.progression.sections?.[0]?.startStepId).toBe("chord-a");
    expect(tiedProject.progression.loopRegion?.startStepId).toBe("chord-a");
    expect(tiedProject.temporaryBranch?.originStepId).toBe("chord-a");
    expect(
      melodySignature(
        tiedProject,
        new Set(original.progression.steps.map((candidate) => candidate.id)),
      ),
    ).toEqual(originalMelody);
    const tiedChord = step(tiedProject, "chord-a");
    expect(tiedChord.kind).toBe("chord");
    if (tiedChord.kind !== "chord" || tiedChord.melody?.mode !== "authored")
      throw new Error("Tie did not materialize the chord and Rest Melody on the retained chord");
    const tiedNoteIds = tiedChord.melody.phrase.notes.map((note) => note.id);
    expect(new Set(tiedNoteIds).size).toBe(tiedNoteIds.length);
    if (restFirst)
      await page.screenshot({ path: "test-results/tie-rest-first-fills-chord-1280x900.png" });
    await expectUndoRedoBytes(page, before, afterTie);

    const audioEvents = await playAndCaptureAudioEvents(page);
    const harmonyEvents = audioEvents.filter(
      (event) => event.channelRole === "upper" || event.channelRole === "bass",
    );
    const chordStart = Math.min(
      ...harmonyEvents.filter((event) => event.stepIndex === 0).map((event) => event.startSeconds),
    );
    expect(
      harmonyEvents.some((event) => Math.abs(event.startSeconds - (chordStart + 1)) < 1e-6),
    ).toBe(false);
    await page
      .getByRole("group", { name: "Progression playback controls" })
      .getByRole("button", { name: "Stop" })
      .click();
  }
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

test("Piano Roll Harmony strip grid lines stay aligned with the Melody grid while zoomed and scrolled", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStudio(page);
  const source = createPianoRollSystemChordFixture();
  const first = source.progression.steps[0];
  if (!first) throw new Error("Fixture is missing its first chord");
  const fixture: Project = Object.freeze({
    ...source,
    progression: Object.freeze({
      ...source.progression,
      steps: Object.freeze([
        Object.freeze({ ...first, duration: musicalDuration(rational(6)) }),
        ...source.progression.steps.slice(1),
      ]),
    }),
  });
  await importProject(page, fixture);
  const zoom = page.getByRole("slider", { name: "Horizontal zoom" });

  for (const value of [70, 120, 180]) {
    await zoom.evaluate((input, zoomValue) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, String(zoomValue));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await expect(zoom).toHaveValue(String(value));
    await page.locator(".score-system-scroll").evaluateAll((scrollers) => {
      for (const scroller of scrollers) {
        const element = scroller as HTMLElement;
        element.scrollLeft = element.scrollWidth - element.clientWidth;
      }
    });
    const measures = await page.locator(".piano-roll-measure").evaluateAll((elements) =>
      elements.map((measure) => {
        const grid = measure.querySelector<HTMLElement>(".piano-roll-grid");
        const harmony = measure.querySelector<HTMLElement>(".piano-roll-harmony");
        const harmonySvg = harmony?.querySelector<SVGSVGElement>(".piano-roll-harmony-grid-lines");
        if (!grid || !harmony || !harmonySvg)
          throw new Error("Piano Roll grid geometry is missing");
        const noteLines = Array.from(
          grid.querySelectorAll<SVGLineElement>(".piano-roll-snap-line"),
        ).map((line) => ({
          offset: line.dataset.gridOffset,
          x: line.getBoundingClientRect().left,
          kind: line.classList.contains("is-bar-line")
            ? "bar"
            : line.classList.contains("is-beat-line")
              ? "beat"
              : "subdivision",
        }));
        const harmonyLines = Array.from(
          harmonySvg.querySelectorAll<SVGLineElement>('.piano-roll-harmony-grid-line[y1="0"]'),
        ).map((line) => ({
          offset: line.dataset.gridOffset,
          x: line.getBoundingClientRect().left,
          kind: line.dataset.gridKind,
        }));
        return {
          pointerEvents: getComputedStyle(harmonySvg).pointerEvents,
          noteLines,
          harmonyLines,
          hasRest: Boolean(harmony.querySelector(".piano-roll-chord.is-rest")),
          hasContinuation: Boolean(
            harmony.querySelector('.piano-roll-chord[aria-label*="continuation"]'),
          ),
        };
      }),
    );
    expect(measures.length).toBeGreaterThan(3);
    expect(measures.some((measure) => measure.hasRest)).toBe(true);
    expect(measures.some((measure) => measure.hasContinuation)).toBe(true);
    for (const measure of measures) {
      expect(measure.pointerEvents).toBe("none");
      expect(measure.noteLines.map((line) => line.offset)).toEqual(
        measure.harmonyLines.map((line) => line.offset),
      );
      expect(measure.noteLines.map((line) => line.kind)).toEqual(
        measure.harmonyLines.map((line) => line.kind),
      );
      expect(
        measure.noteLines.every(
          (line, index) => Math.abs(line.x - measure.harmonyLines[index]!.x) < 1,
        ),
      ).toBe(true);
    }
  }
});

test("editable Piano Roll chord edges expose an ew-resize cursor and keep short chord bodies usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStudio(page);
  const paired = withSameMeasureChordPair(createPianoRollSystemChordFixture());
  const [first, second, spacer, ...tail] = paired.progression.steps;
  if (!first || !second || !spacer || spacer.kind !== "rest")
    throw new Error("The editable-edge fixture is incomplete");
  const fixture: Project = Object.freeze({
    ...paired,
    progression: Object.freeze({
      ...paired.progression,
      steps: Object.freeze([
        Object.freeze({ ...first, duration: musicalDuration(rational(1, 6)) }),
        Object.freeze({ ...second, duration: musicalDuration(rational(23, 6)) }),
        spacer,
        ...tail,
      ]),
    }),
  });
  await importProject(page, fixture);
  await page.getByLabel("Snap resolution").selectOption("1/16 triplet");

  const shortChord = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first();
  await shortChord.click();
  const rightHandle = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="right"]',
  );
  await expect(rightHandle).toBeVisible();
  await rightHandle.scrollIntoViewIfNeeded();
  const handleBox = await rightHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  await rightHandle.hover();
  const hoverState = await rightHandle.evaluate((element) => ({
    cursor: getComputedStyle(element).cursor,
    marker: getComputedStyle(element, "::after").backgroundColor,
    hovered: element.matches(":hover"),
  }));
  expect(hoverState.hovered).toBe(true);
  expect(hoverState.cursor).toBe("ew-resize");
  expect(hoverState.marker).not.toBe("rgba(0, 0, 0, 0)");

  await page.mouse.down();
  await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
  await expect(rightHandle).toHaveClass(/is-previewing/);
  await page.mouse.up();
  await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
  await expect(rightHandle).not.toHaveClass(/is-previewing/);

  const shortChordBox = await shortChord.boundingBox();
  expect(shortChordBox).not.toBeNull();
  const bodyTarget = await page.evaluate(
    ({ x, y }) =>
      document
        .elementFromPoint(x, y)
        ?.closest(".piano-roll-chord")
        ?.getAttribute("data-source-step-id"),
    {
      x: shortChordBox!.x + shortChordBox!.width / 2,
      y: shortChordBox!.y + shortChordBox!.height / 2,
    },
  );
  expect(bodyTarget).toBe("chord-a");
  await shortChord.click({
    position: { x: shortChordBox!.width / 2, y: shortChordBox!.height / 2 },
  });
  await expect(shortChord).toHaveAttribute("aria-pressed", "true");

  const nextChord = page.locator('.piano-roll-chord[data-source-step-id="chord-b"]').first();
  await nextChord.click();
  const leftHandle = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-b"][data-boundary-edge="left"]',
  );
  await expect(leftHandle).toBeVisible();
  await leftHandle.scrollIntoViewIfNeeded();
  const leftBox = await leftHandle.boundingBox();
  expect(leftBox).not.toBeNull();
  await leftHandle.hover();
  const leftHoverState = await leftHandle.evaluate((element) => ({
    cursor: getComputedStyle(element).cursor,
    marker: getComputedStyle(element, "::after").backgroundColor,
    hovered: element.matches(":hover"),
  }));
  expect(leftHoverState.hovered).toBe(true);
  expect(leftHoverState.cursor).toBe("ew-resize");
  expect(leftHoverState.marker).not.toBe("rgba(0, 0, 0, 0)");
});

test("boundary drag autoscrolls across Systems and pointer cancellation preserves the snapshot", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 360 });
  await openStudio(page);
  const fixture = withSameMeasureChordPair(createPianoRollSystemChordFixture());
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
  const scrollMetrics = await page.evaluate(() => {
    const studio = document.querySelector<HTMLElement>(".studio-grid");
    const header = document.querySelector<HTMLElement>(".app-header");
    const footer = document.querySelector<HTMLElement>(".app-status-bar");
    if (!studio || !header || !footer) {
      throw new Error("The Studio scroll region, app header, and status bar must be present");
    }
    const bounds = studio.getBoundingClientRect();
    return {
      scrollTop: studio.scrollTop,
      scrollHeight: studio.scrollHeight,
      clientHeight: studio.clientHeight,
      top: bounds.top,
      bottom: bounds.bottom,
      headerBottom: header.getBoundingClientRect().bottom,
      footerTop: footer.getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
    };
  });
  const studioScroller = page.locator(".studio-grid");
  const scrollTargetY = Math.min(
    scrollMetrics.bottom - 8,
    scrollMetrics.footerTop - 8,
    scrollMetrics.viewportHeight - 8,
  );
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
  expect(start.y).toBeGreaterThan(scrollMetrics.headerBottom);
  expect(start.y).toBeLessThan(scrollMetrics.bottom);
  expect(scrollTargetY).toBeGreaterThan(scrollMetrics.bottom - 28);
  expect(scrollTargetY).toBeLessThan(scrollMetrics.footerTop);
  const startingScroll = scrollMetrics.scrollTop;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let index = 0; index < 8; index += 1) {
    await page.mouse.move(start.x, scrollTargetY);
    await page.waitForTimeout(40);
  }
  await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
  await expect
    .poll(() => studioScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(startingScroll);
  await boundary.evaluate((element) =>
    element.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 })),
  );
  await page.mouse.up();
  await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
  expect(await exportProjectText(page)).toBe(before);
});

test("cross-System resize creates Rest1 and keeps the following F fixed at beat 8", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 360 });
  await openStudio(page);
  const fixture = withEmAtFourAndFAtEight(createPianoRollSystemChordFixture());
  const project: Project = Object.freeze({
    ...fixture,
    presentation: Object.freeze({ ...fixture.presentation, measuresPerSystem: 1 }),
  });
  await importProject(page, project);

  const sourceChord = page.locator('.piano-roll-chord[data-source-step-id="chord-b"]').first();
  await sourceChord.click();
  const audition = page.getByTestId("piano-roll-playhead");
  if (await audition.count()) await expect(audition).toHaveCount(0, { timeout: 8_000 });

  const before = await exportProjectText(page);
  const beforeProject = decodePortableProject(before);
  const boundary = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-b"][data-boundary-edge="right"]',
  );
  await boundary.scrollIntoViewIfNeeded();
  const handleBox = await boundary.boundingBox();
  if (!handleBox) throw new Error("System 1 boundary handle is not visible");
  const start = {
    x: handleBox.x + handleBox.width / 2,
    y: handleBox.y + handleBox.height / 2,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");

  const targetGrid = page.getByRole("region", { name: "Measure 2" }).locator(".piano-roll-grid");
  const targetBox = await targetGrid.boundingBox();
  if (!targetBox || targetBox.y >= 352 || targetBox.y + targetBox.height <= 36)
    throw new Error("Measure 2 is not visible for the cross-System boundary drag");
  const visibleTop = Math.max(targetBox.y + 1, 28);
  const visibleBottom = Math.min(targetBox.y + targetBox.height - 1, 332);
  if (visibleBottom <= visibleTop)
    throw new Error("Measure 2 has no usable visible Piano Roll area for the drag");
  const target = {
    x: targetBox.x + (targetBox.width * 3) / 4,
    y: (visibleTop + visibleBottom) / 2,
  };
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
  expect(Number(await boundary.getAttribute("aria-valuenow"))).toBeCloseTo(7, 6);
  await page.mouse.up();
  await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
  await expect(page.getByTestId("piano-roll-playhead")).toHaveCount(0);

  const after = await exportProjectText(page);
  const afterProject = decodePortableProject(after);
  expect(step(afterProject, "chord-b").duration.beats).toEqual(rational(3));
  expect(stepStart(afterProject, "chord-b")).toEqual(rational(4));
  const gap =
    afterProject.progression.steps[
      afterProject.progression.steps.findIndex((candidate) => candidate.id === "chord-b") + 1
    ];
  expect(gap?.kind).toBe("rest");
  expect(gap?.duration.beats).toEqual(rational(1));
  expect(step(afterProject, "chord-c").kind).toBe("chord");
  expect(stepStart(afterProject, "chord-c")).toEqual(rational(8));
  expect(sumDuration(afterProject)).toEqual(sumDuration(beforeProject));
  for (const stepId of ["chord-c", "rest-d", "generated-e", "chord-f"]) {
    expect(step(afterProject, stepId)).toEqual(step(beforeProject, stepId));
    expect(stepStart(afterProject, stepId)).toEqual(stepStart(beforeProject, stepId));
  }
  expect(fullMelodySignature(afterProject)).toEqual(fullMelodySignature(beforeProject));

  const chordAAfter = step(afterProject, "chord-a");
  expect(chordAAfter.kind).toBe("chord");
  if (chordAAfter.kind !== "chord" || chordAAfter.melody?.mode !== "authored")
    throw new Error("Cross-System reanchoring did not preserve authored Melody");
  expect(new Set(chordAAfter.melody.phrase.notes.map((note) => note.id)).size).toBe(
    chordAAfter.melody.phrase.notes.length,
  );
  await expectUndoRedoBytes(page, before, after);
});

test("keyboard boundary resize supports full chord merge and keeps project edges fixed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStudio(page);
  const fixture = withSameMeasureChordPair(createPianoRollSystemChordFixture());
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
  await expect(startHandle).toHaveAttribute("aria-valuemin", "0");
  await expect(startHandle).toHaveAttribute("aria-valuenow", "0");
  const beforeProjectEdge = await exportProjectText(page);
  await startHandle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
  expect(Number(await startHandle.getAttribute("aria-valuenow"))).toBeCloseTo(0, 6);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
  expect(Number(await startHandle.getAttribute("aria-valuenow"))).toBeCloseTo(0.5, 6);
  await page.keyboard.press("Escape");
  expect(await exportProjectText(page)).toBe(beforeProjectEdge);
  const boundary = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="right"]',
  );
  const beforeMaximum = await exportProjectText(page);
  await boundary.focus();
  for (let index = 0; index < 32; index += 1) await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
  expect(Number(await boundary.getAttribute("aria-valuenow"))).toBeCloseTo(4, 6);
  await page.keyboard.press("Enter");
  const afterMaximum = await exportProjectText(page);
  const maximumProject = decodePortableProject(afterMaximum);
  expect(maximumProject.progression.steps.map((candidate) => candidate.id)).not.toContain(
    "chord-b",
  );
  expect(step(maximumProject, "chord-a").duration.beats).toEqual(rational(4));
  expect(stepStart(maximumProject, "chord-c")).toEqual(rational(8));
  expect(sumDuration(maximumProject)).toEqual(sumDuration(fixture));
  await page.waitForTimeout(100);
  await expect(playhead).toHaveCount(0);
  await expectUndoRedoBytes(page, beforeMaximum, afterMaximum);

  await importProject(page, fixture);
  await page.getByLabel("Snap resolution").selectOption("1/8");
  await page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first().click();
  if (await playhead.count()) await expect(playhead).toHaveCount(0, { timeout: 8_000 });
  const beforeMinimum = await exportProjectText(page);
  await boundary.focus();
  for (let index = 0; index < 48; index += 1) await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
  expect(Number(await boundary.getAttribute("aria-valuenow"))).toBeCloseTo(0.5, 6);
  await page.keyboard.press("Enter");
  const afterMinimum = await exportProjectText(page);
  const minimumProject = decodePortableProject(afterMinimum);
  expect(step(minimumProject, "chord-a").duration.beats).toEqual(rational(1, 2));
  expect(step(minimumProject, "chord-b").duration.beats).toEqual(rational(7, 2));
  expect(stepStart(minimumProject, "chord-c")).toEqual(rational(8));
  expect(sumDuration(minimumProject)).toEqual(sumDuration(fixture));
  expect(await playhead.count()).toBe(0);
  await expectUndoRedoBytes(page, beforeMinimum, afterMinimum);

  const finalChord = page.locator('.piano-roll-chord[data-source-step-id="chord-f"]').first();
  await finalChord.scrollIntoViewIfNeeded();
  await finalChord.click();
  if (await playhead.count()) await expect(playhead).toHaveCount(0, { timeout: 8_000 });
  const finalEdge = page.locator(
    '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-f"][data-boundary-edge="right"]',
  );
  await expect(finalEdge).toHaveAttribute("aria-valuemax", "24");
  expect(Number(await finalEdge.getAttribute("aria-valuenow"))).toBeCloseTo(24, 6);
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
    .getByTestId("progression-view-btn-tablature")
    .evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByTestId("progression-view-btn-tablature")).toHaveAttribute(
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
