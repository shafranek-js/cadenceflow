import { requireValue } from "../fixtures/assertions";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { exactPitch } from "../../src/domain/harmony/pitch";
import type {
  AuthoredMelodyNote,
  AuthoredMelodyPhrase,
  ChordMelodyRecipe,
} from "../../src/domain/melody/types";
import type { Project } from "../../src/domain/project/project";
import type { ProgressionStep, RestStep } from "../../src/domain/progression/step";
import { musicalDuration } from "../../src/domain/timing/duration";
import { setProgressionView } from "./test-helpers/progression-settings";
import { globalTiming, meter } from "../../src/domain/timing/meter";
import { rational } from "../../src/domain/timing/rational";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../src/persistence/portableProject";
import { createRichProjectFixture } from "../fixtures/rich-project.fixture";
import { setLayoutMeasuresPerSystem } from "./test-helpers/progression-settings";

type PortableRational = { numerator: number; denominator: number };
type PortableMelodyNote = {
  id: string;
  pitch: { midiNumber: number };
  onset: PortableRational;
  duration: PortableRational;
};
type PortableMelody = {
  mode: "generated" | "authored";
  recipe?: unknown;
  sourceRecipe?: unknown;
  phrase?: { notes: PortableMelodyNote[]; sourceRecipe?: unknown };
};
type PortableStep = {
  id: string;
  melody?: PortableMelody;
  duration?: { beats: PortableRational };
};
type PortableProject = { progression: { steps: PortableStep[] } };

async function exportPortableProject(
  page: import("@playwright/test").Page,
): Promise<PortableProject> {
  return JSON.parse(await downloadPortableProjectText(page)) as PortableProject;
}

async function downloadPortableProjectText(
  page: import("@playwright/test").Page,
  escapeFirst = true,
  escapeAfter = true,
): Promise<string> {
  if (escapeFirst) await page.keyboard.press("Escape");
  const exportToggle = page.getByTestId("export-menu-toggle");
  if ((await exportToggle.getAttribute("aria-expanded")) === "true") await exportToggle.click();
  const projectDownload = page.waitForEvent("download");
  await exportToggle.click();
  const exportMenu = page.getByRole("menu", { name: "Export menu" });
  await expect(exportMenu).toBeVisible();
  await exportMenu.getByTestId("project-export-btn").click();
  const download = await projectDownload;
  if (escapeAfter) await page.keyboard.press("Escape");
  else if ((await exportToggle.getAttribute("aria-expanded")) === "true")
    await exportToggle.click();
  const path = await download.path();
  if (!path) throw new Error("Could not read portable Project download");
  return readFile(path, "utf8");
}

async function exportDecodedProject(
  page: import("@playwright/test").Page,
  escapeFirst = true,
  escapeAfter = true,
): Promise<Project> {
  return decodePortableProject(await downloadPortableProjectText(page, escapeFirst, escapeAfter));
}

const SHARED_OWNER_NOTE_ID = "shared-local-note-id";

function createOwnerCollisionFixture(): Project {
  const base = createRichProjectFixture();
  const bar = musicalDuration(rational(4, 1), { kind: "bars", bars: 1 });
  const pitches = {
    e4: exactPitch(64, { step: "E", alter: 0 }),
    g4: exactPitch(67, { step: "G", alter: 0 }),
    a4: exactPitch(69, { step: "A", alter: 0 }),
    d5: exactPitch(74, { step: "D", alter: 0 }),
    e5: exactPitch(76, { step: "E", alter: 0 }),
    g5: exactPitch(79, { step: "G", alter: 0 }),
    c5: exactPitch(72, { step: "C", alter: 0 }),
    f3: exactPitch(53, { step: "F", alter: 0 }),
  };
  const note = (
    id: string,
    pitch: (typeof pitches)[keyof typeof pitches],
    onset: ReturnType<typeof rational>,
    duration: ReturnType<typeof rational>,
  ): AuthoredMelodyNote => Object.freeze({ id, pitch, onset, duration });
  const phrase = (authoredNotes: readonly AuthoredMelodyNote[]): AuthoredMelodyPhrase =>
    Object.freeze({ notes: Object.freeze([...authoredNotes]) });
  const authored = (
    authoredNotes: readonly AuthoredMelodyNote[],
    sourceRecipe?: ChordMelodyRecipe,
  ) => ({
    mode: "authored" as const,
    phrase: phrase(authoredNotes),
    ...(sourceRecipe ? { sourceRecipe } : {}),
  });
  const first = base.progression.steps[0];
  const sourceRecipe =
    first?.kind === "chord" && first.melody?.mode === "generated" ? first.melody.recipe : undefined;

  const steps: ProgressionStep[] = base.progression.steps.map((step) => {
    if (step.id === "step-1" && step.kind === "chord") {
      return {
        ...step,
        duration: bar,
        melody: authored(
          [
            note(SHARED_OWNER_NOTE_ID, pitches.e4, rational(0, 1), rational(1, 1)),
            note("owner-one-unselected", pitches.d5, rational(2, 1), rational(1, 2)),
          ],
          sourceRecipe,
        ),
      };
    }
    if (step.id === "step-2" && step.kind === "chord") {
      return {
        ...step,
        duration: bar,
        melody: authored([
          note(SHARED_OWNER_NOTE_ID, pitches.a4, rational(0, 1), rational(1, 1)),
          note("owner-two-unselected", pitches.g4, rational(2, 1), rational(1, 2)),
        ]),
      };
    }
    if (step.id === "step-3" && step.kind === "rest") {
      const restStep: RestStep = {
        ...step,
        duration: bar,
        authoredMelody: phrase([
          note(SHARED_OWNER_NOTE_ID, pitches.c5, rational(0, 1), rational(1, 1)),
          note("rest-polyphony-companion", pitches.e5, rational(0, 1), rational(1, 1)),
          note("rest-owner-unselected", pitches.g5, rational(2, 1), rational(1, 2)),
        ]),
      };
      return restStep;
    }
    if (step.id === "step-4" && step.kind === "chord") {
      return {
        ...step,
        duration: bar,
        melody: authored([
          note("other-owner-unselected", pitches.f3, rational(1, 1), rational(1, 2)),
        ]),
      };
    }
    return { ...step, duration: bar };
  });

  return {
    ...base,
    id: "system-note-panel-owner-collision-fixture",
    name: "System Note Panel Owner Collision Fixture",
    globalTiming: globalTiming(120, meter(4, 4)),
    presentation: {
      ...base.presentation,
      progressionView: "piano-roll",
      measuresPerSystem: 4,
    },
    progression: {
      ...base.progression,
      steps,
      sections: [
        { id: "owner-fixture-section-main", name: "Main", startStepId: "step-1" },
        { id: "owner-fixture-section-rest", name: "Rest", startStepId: "step-3" },
      ],
    },
  };
}

function authoredNotesFor(project: Project, stepId: string): readonly AuthoredMelodyNote[] {
  const step = project.progression.steps.find((candidate) => candidate.id === stepId);
  if (!step) throw new Error(`Portable Project omitted Step ${stepId}`);
  if (step.kind === "rest") {
    if (!step.authoredMelody) throw new Error(`Portable Project omitted Rest Melody ${stepId}`);
    return step.authoredMelody.notes;
  }
  if (step.melody?.mode !== "authored")
    throw new Error(`Portable Project omitted authored Melody ${stepId}`);
  return step.melody.phrase.notes;
}

function stepFor(project: Project, stepId: string): ProgressionStep {
  const step = project.progression.steps.find((candidate) => candidate.id === stepId);
  if (!step) throw new Error(`Portable Project omitted Step ${stepId}`);
  return step;
}

function noteFor(project: Project, stepId: string, noteId: string): AuthoredMelodyNote {
  const note = authoredNotesFor(project, stepId).find((candidate) => candidate.id === noteId);
  if (!note) throw new Error(`Portable Project omitted note ${noteId} from Step ${stepId}`);
  return note;
}

function notesById(notes: readonly AuthoredMelodyNote[]): AuthoredMelodyNote[] {
  return [...notes].sort((left, right) => left.id.localeCompare(right.id));
}

function expectAuthoredNotesEqual(
  actual: readonly AuthoredMelodyNote[],
  expected: readonly AuthoredMelodyNote[],
) {
  expect(notesById(actual)).toEqual(notesById(expected));
}

function projectWithoutMelodyEdits(project: Project) {
  const { updatedAt: _updatedAt, ...stableProject } = project;
  return {
    ...stableProject,
    progression: {
      ...project.progression,
      steps: project.progression.steps.map((step) => {
        if (step.kind === "rest") {
          const { authoredMelody: _authoredMelody, ...rest } = step;
          return rest;
        }
        const { melody: _melody, ...chord } = step;
        return chord;
      }),
    },
  };
}

function expectProjectContextUnchanged(project: Project, baseline: Project) {
  expect(projectWithoutMelodyEdits(project)).toEqual(projectWithoutMelodyEdits(baseline));
}

function portableMelody(project: PortableProject, stepId: string): PortableMelody {
  const step = project.progression.steps.find((candidate) => candidate.id === stepId);
  if (!step?.melody) throw new Error(`Portable Project omitted Melody for Step ${stepId}`);
  return step.melody;
}

function portableRecipe(melody: PortableMelody): unknown {
  return melody.mode === "generated"
    ? melody.recipe
    : (melody.sourceRecipe ?? melody.phrase?.sourceRecipe);
}

function portableNote(melody: PortableMelody, id: string): PortableMelodyNote {
  const note =
    melody.mode === "authored" ? melody.phrase?.notes.find((item) => item.id === id) : null;
  if (!note) throw new Error(`Portable Project omitted authored note ${id}`);
  return note;
}

function rationalText(value: PortableRational): string {
  return `${value.numerator}/${value.denominator}`;
}

function durationUiState(duration: string): { duration: string; triplet: boolean } {
  const [numerator, denominator] = duration.split("/").map(Number);
  if (!numerator || !denominator) return { duration: "custom", triplet: false };
  for (const preset of ["4/1", "2/1", "1/1", "1/2", "1/4"] as const) {
    const [baseNumerator, baseDenominator] = preset.split("/").map(Number);
    if (numerator * requireValue(baseDenominator) === requireValue(baseNumerator) * denominator) {
      return { duration: preset, triplet: false };
    }
    if (
      numerator * requireValue(baseDenominator) * 3 ===
      requireValue(baseNumerator) * denominator * 2
    ) {
      return { duration: preset, triplet: true };
    }
  }
  return { duration: "custom", triplet: false };
}

function tripletDuration(preset: string): string {
  const [numerator, denominator] = preset.split("/").map(Number);
  const divisor = (a: number, b: number): number => (b === 0 ? a : divisor(b, a % b));
  const top = (numerator ?? 1) * 2;
  const bottom = (denominator ?? 1) * 3;
  const common = divisor(top, bottom);
  return `${top / common}/${bottom / common}`;
}

async function positionBelowAppHeader(
  page: import("@playwright/test").Page,
  selector: string,
): Promise<void> {
  await page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const appHeader = document.querySelector<HTMLElement>(".app-header");
      const studioScroller = document.querySelector<HTMLElement>(".studio-grid");
      const statusBar = document.querySelector<HTMLElement>(".app-status-bar");
      if (!appHeader || !studioScroller || !statusBar)
        throw new Error("The Studio header, scroll region or status bar is missing");

      const elementBounds = element.getBoundingClientRect();
      const studioBounds = studioScroller.getBoundingClientRect();
      const safeTop = Math.max(studioBounds.top, appHeader.getBoundingClientRect().bottom) + 8;
      const safeBottom = Math.min(studioBounds.bottom, statusBar.getBoundingClientRect().top) - 8;
      const scrollDelta =
        elementBounds.top < safeTop
          ? elementBounds.top - safeTop
          : elementBounds.bottom > safeBottom
            ? elementBounds.bottom - safeBottom
            : 0;
      if (scrollDelta !== 0) studioScroller.scrollTop += scrollDelta;
    });
}

async function audioStartCount(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(
    () => (window as Window & { __notePanelAudioStarts?: number }).__notePanelAudioStarts ?? 0,
  );
}

async function historyAction(page: import("@playwright/test").Page, action: "Undo" | "Redo") {
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) })
    .click();
}

async function undoIsEnabled(page: import("@playwright/test").Page) {
  return historyIsEnabled(page, "Undo");
}

async function redoIsEnabled(page: import("@playwright/test").Page) {
  return historyIsEnabled(page, "Redo");
}

async function historyIsEnabled(page: import("@playwright/test").Page, action: "Undo" | "Redo") {
  await page.getByTestId("edit-menu-toggle").click();
  const enabled = await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) })
    .isEnabled();
  await page.keyboard.press("Escape");
  return enabled;
}

test("System note panel edits selected notes and keeps empty-cell clicks transient", async ({
  page,
}) => {
  test.setTimeout(360_000);
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem(
      "cadenceflow.pianoRollPreferences",
      JSON.stringify({ prospectiveDuration: "4/1", prospectiveTriplet: true }),
    );
    const audioWindow = window as Window & { __notePanelAudioStarts?: number };
    audioWindow.__notePanelAudioStarts = 0;
    const sourceTypes = [window.AudioBufferSourceNode, window.OscillatorNode];
    for (const sourceType of sourceTypes) {
      const prototype = sourceType.prototype as AudioBufferSourceNode & OscillatorNode;
      const originalStart = prototype.start as (...args: number[]) => void;
      prototype.start = function (this: AudioBufferSourceNode & OscillatorNode, ...args: number[]) {
        audioWindow.__notePanelAudioStarts = (audioWindow.__notePanelAudioStarts ?? 0) + 1;
        return originalStart.apply(this, args);
      };
    }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });
  for (const chord of ["I", "V", "vi", "IV"]) {
    await page
      .getByTestId(`chord-card-${chord}`)
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
  }
  for (const chord of ["I", "V", "vi", "IV"]) {
    await page
      .getByTestId(`chord-card-${chord}`)
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
  }
  await setProgressionView(page, "staff");
  const step = page.locator("[data-progression-step-select]").first();
  const stepId = await step.getAttribute("data-step-id");
  if (!stepId) throw new Error("First Step has no stable ID");
  await step.click({ button: "right" });
  await page
    .getByRole("menu", { name: /Melody actions/ })
    .getByRole("menuitem", { name: "Create Melody…" })
    .click();
  await page
    .getByRole("dialog", { name: "Create Melody" })
    .getByRole("button", { name: "Apply Melody" })
    .click();
  const secondStep = page.locator("[data-progression-step-select]").nth(1);
  const secondStepId = await secondStep.getAttribute("data-step-id");
  if (!secondStepId) throw new Error("Second Step has no stable ID");
  await secondStep.click({ button: "right" });
  await page
    .getByRole("menu", { name: /Melody actions/ })
    .getByRole("menuitem", { name: "Create Melody…" })
    .click();
  await page
    .getByRole("dialog", { name: "Create Melody" })
    .getByRole("button", { name: "Apply Melody" })
    .click();
  await setLayoutMeasuresPerSystem(page, 1);
  await page.getByTestId("progression-view-btn-piano-roll").click();

  expect((await page.locator(".score-system-header").allTextContents()).join(" ")).not.toMatch(
    /activeNoteIdentity|systemNotes|numerator|denominator/,
  );
  const note = page
    .getByRole("group", { name: "Melody grid, measure 1" })
    .locator(`button.piano-roll-note[data-source-step-id='${stepId}']`);
  const firstNote = note.nth(0);
  const anchorNote = note.nth(1);
  const systemPanel = page.getByTestId("piano-roll-system-note-panel-0");
  await expect(systemPanel).toHaveCount(0);
  const secondSystemNote = page
    .getByRole("group", { name: "Melody grid, measure 2" })
    .locator(`button.piano-roll-note[data-source-step-id='${secondStepId}']`);
  const secondSystemPanel = page.getByTestId("piano-roll-system-note-panel-1");
  await expect(secondSystemPanel).toHaveCount(0);
  const theme = page.getByRole("group", { name: "Theme" });
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 640, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    for (const themeName of ["Dark", "Light"] as const) {
      if (
        (await theme
          .getByRole("button", { name: `${themeName} theme` })
          .getAttribute("aria-pressed")) !== "true"
      ) {
        await theme.getByRole("button", { name: `${themeName} theme` }).click();
      }
      for (const gridMode of ["Degrees", "Chromatic"] as const) {
        await page
          .getByRole("group", { name: "Pitch grid" })
          .getByRole("button", { name: gridMode, exact: true })
          .click();
        await expect(systemPanel).toHaveCount(0);
        expect(
          (await page.locator(".score-system-header").allTextContents()).join(" "),
        ).not.toMatch(/activeNoteIdentity|systemNotes|numerator|denominator/);
        await expect
          .poll(() =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
            ),
          )
          .toBe(true);
        await page.screenshot({
          path: `test-results/system-note-panel-${viewport.width}x${viewport.height}-${themeName.toLowerCase()}-${gridMode.toLowerCase()}-deselected.png`,
        });
      }
    }
  }
  const emptyCursorGrid = page.getByRole("group", { name: "Melody grid, measure 1" });
  const emptyCursorGridBox = await emptyCursorGrid.boundingBox();
  if (!emptyCursorGridBox) throw new Error("Melody grid has no visible bounds");
  await emptyCursorGrid.click({
    position: { x: emptyCursorGridBox.width * 0.94, y: emptyCursorGridBox.height * 0.2 },
  });
  await expect(page.getByTestId("piano-roll-editing-cursor")).toBeVisible();
  await expect(systemPanel).toHaveCount(0);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 640, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    for (const themeName of ["Dark", "Light"] as const) {
      await theme.getByRole("button", { name: `${themeName} theme` }).click();
      for (const gridMode of ["Degrees", "Chromatic"] as const) {
        await page
          .getByRole("group", { name: "Pitch grid" })
          .getByRole("button", { name: gridMode, exact: true })
          .click();
        for (const [kind, selector] of [
          ["note", "button.piano-roll-note"],
          ["chord", ".piano-roll-chord"],
        ] as const) {
          await positionBelowAppHeader(page, selector);
          const bounds = await page
            .locator(selector)
            .first()
            .evaluate((element) => {
              const rect = element.getBoundingClientRect();
              const appHeader = document.querySelector<HTMLElement>(".app-header")!;
              const studioScroller = document.querySelector<HTMLElement>(".studio-grid")!;
              const statusBar = document.querySelector<HTMLElement>(".app-status-bar")!;
              return {
                top: rect.top,
                bottom: rect.bottom,
                headerBottom: appHeader.getBoundingClientRect().bottom,
                studioTop: studioScroller.getBoundingClientRect().top,
                studioBottom: studioScroller.getBoundingClientRect().bottom,
                statusBarTop: statusBar.getBoundingClientRect().top,
                viewportHeight: window.innerHeight,
              };
            });
          expect(bounds.top).toBeGreaterThanOrEqual(bounds.headerBottom - 1);
          expect(bounds.top).toBeGreaterThanOrEqual(bounds.studioTop - 1);
          expect(bounds.bottom).toBeLessThanOrEqual(bounds.studioBottom + 1);
          expect(bounds.bottom).toBeLessThanOrEqual(bounds.statusBarTop + 1);
          expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight + 1);
          await expect(systemPanel).toHaveCount(0);
          await page.screenshot({
            path: `test-results/system-note-panel-${viewport.width}x${viewport.height}-${themeName.toLowerCase()}-${gridMode.toLowerCase()}-cursor-${kind}-visible.png`,
          });
        }
      }
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  const portableGeneratedBaseline = await exportPortableProject(page);
  const generatedMelodyBaseline = portableMelody(portableGeneratedBaseline, stepId);
  expect(generatedMelodyBaseline.mode).toBe("generated");
  await expect(note.first()).toBeVisible();
  await note.first().click();
  await expect(systemPanel).toBeVisible();
  expect((await page.locator(".score-system-header").allTextContents()).join(" ")).not.toMatch(
    /activeNoteIdentity|systemNotes|numerator|denominator/,
  );
  for (const [name, title] of [
    ["Previous note in scale", "Lower selected notes to the previous note in the active scale"],
    ["Next note in scale", "Raise selected notes to the next note in the active scale"],
    ["Octave down", "Lower selected notes by one octave"],
    ["Octave up", "Raise selected notes by one octave"],
    ["Half-step down", "Lower selected notes by one semitone"],
    ["Half-step up", "Raise selected notes by one semitone"],
  ] as const) {
    await expect(systemPanel.getByRole("button", { name })).toHaveAttribute("title", title);
  }
  await expect(secondSystemPanel).toHaveCount(0);
  await secondSystemNote.first().click();
  await expect(systemPanel).toHaveCount(0);
  await expect(secondSystemPanel).toBeVisible();
  const secondGrid = page.getByRole("group", { name: "Melody grid, measure 2" });
  const secondGridBox = await secondGrid.boundingBox();
  if (!secondGridBox) throw new Error("Second System grid has no visible bounds");
  await secondGrid.click({
    position: { x: secondGridBox.width * 0.94, y: secondGridBox.height * 0.2 },
  });
  await expect(page.getByTestId("piano-roll-editing-cursor")).toBeVisible();
  await expect(secondSystemPanel).toHaveCount(0);
  await note.first().scrollIntoViewIfNeeded();
  await note.first().click();
  await expect(systemPanel).toBeVisible();
  await expect(systemPanel.getByRole("group", { name: "Choose note pitch" })).toBeVisible();
  const guidesButton = page.getByRole("button", { name: "Guides" });
  const zoomControl = page.getByRole("slider", { name: "Horizontal zoom" });
  for (const viewport of [
    { width: 480, height: 900 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 640, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    for (const themeName of ["Dark", "Light"] as const) {
      await theme.getByRole("button", { name: `${themeName} theme` }).click();
      for (const gridMode of ["Degrees", "Chromatic"] as const) {
        await page
          .getByRole("group", { name: "Pitch grid" })
          .getByRole("button", { name: gridMode, exact: true })
          .click();
        for (const paletteMode of ["Degrees", "Chromatic"] as const) {
          await systemPanel
            .getByRole("group", { name: "Note palette mode" })
            .getByRole("button", { name: paletteMode, exact: true })
            .click();
          await expect
            .poll(() =>
              page.evaluate(() => {
                const raw = localStorage.getItem("cadenceflow.pianoRollPreferences");
                return raw ? JSON.parse(raw).paletteMode : null;
              }),
            )
            .toBe(paletteMode.toLowerCase());
          await expect
            .poll(() =>
              page.evaluate(
                () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
              ),
            )
            .toBe(true);
          await expect(systemPanel).toBeVisible();
          await expect(systemPanel.locator(":focus")).toHaveCount(1);
          await page.locator(".piano-roll-measure").first().scrollIntoViewIfNeeded();
          await positionBelowAppHeader(page, ".score-system-header");
          await expect(page.locator(".piano-roll-grid").first()).toBeVisible();
          const positioned = await page.evaluate(() => {
            const header = document.querySelector<HTMLElement>(".score-system-header")!;
            const appHeader = document.querySelector<HTMLElement>(".app-header")!;
            const studioScroller = document.querySelector<HTMLElement>(".studio-grid")!;
            const statusBar = document.querySelector<HTMLElement>(".app-status-bar")!;
            const grid = document.querySelector<HTMLElement>(".piano-roll-grid")!;
            const studioBounds = studioScroller.getBoundingClientRect();
            const gridBounds = grid.getBoundingClientRect();
            return {
              appHeaderBottom: appHeader.getBoundingClientRect().bottom,
              headerTop: header.getBoundingClientRect().top,
              headerBottom: header.getBoundingClientRect().bottom,
              studioTop: studioBounds.top,
              studioBottom: studioBounds.bottom,
              statusBarTop: statusBar.getBoundingClientRect().top,
              gridTop: gridBounds.top,
              gridBottom: gridBounds.bottom,
              viewportHeight: window.innerHeight,
            };
          });
          expect(positioned.headerTop).toBeGreaterThanOrEqual(positioned.appHeaderBottom - 1);
          expect(positioned.headerTop).toBeGreaterThanOrEqual(positioned.studioTop - 1);
          expect(positioned.headerBottom).toBeLessThanOrEqual(positioned.studioBottom + 1);
          expect(positioned.headerBottom).toBeLessThanOrEqual(positioned.statusBarTop + 1);
          expect(positioned.gridTop).toBeGreaterThanOrEqual(positioned.headerBottom);
          expect(positioned.gridTop).toBeGreaterThanOrEqual(positioned.studioTop - 1);
          expect(positioned.gridTop).toBeLessThan(positioned.viewportHeight);
          expect(positioned.gridBottom).toBeGreaterThan(positioned.gridTop);
          const panelBounds = await systemPanel.evaluate((panel) => {
            const bounds = panel.getBoundingClientRect();
            const controls = Array.from(
              panel.querySelectorAll<HTMLElement>("button, select, input"),
            );
            return {
              clientWidth: panel.clientWidth,
              scrollWidth: panel.scrollWidth,
              clientHeight: panel.clientHeight,
              scrollHeight: panel.scrollHeight,
              groups: Array.from(panel.children).map((child) => {
                const element = child as HTMLElement;
                const rect = element.getBoundingClientRect();
                return {
                  className: element.className,
                  width: rect.width,
                  scrollWidth: element.scrollWidth,
                  clientWidth: element.clientWidth,
                };
              }),
              outOfBounds: controls
                .map((control) => ({
                  control,
                  rect: control.getBoundingClientRect(),
                }))
                .filter(
                  ({ rect }) =>
                    rect.left < bounds.left - 1 ||
                    rect.right > bounds.right + 1 ||
                    rect.top < bounds.top - 1 ||
                    rect.bottom > bounds.bottom + 1,
                ).length,
              missedTargets: controls.filter((control) => {
                const rect = control.getBoundingClientRect();
                const hit = document.elementFromPoint(
                  rect.left + rect.width / 2,
                  rect.top + rect.height / 2,
                );
                return !(
                  hit &&
                  (hit === control || control.contains(hit) || hit.contains(control))
                );
              }).length,
            };
          });
          expect(panelBounds.scrollWidth, JSON.stringify(panelBounds.groups)).toBeLessThanOrEqual(
            panelBounds.clientWidth,
          );
          expect(panelBounds.scrollHeight).toBeLessThanOrEqual(panelBounds.clientHeight);
          expect(panelBounds.outOfBounds).toBe(0);
          expect(panelBounds.missedTargets).toBe(0);
          const rowAlignment = await systemPanel.evaluate((panel) => {
            const header = panel.closest<HTMLElement>(".score-system-header")!;
            const title =
              header.querySelector<HTMLElement>('[data-testid^="score-system-audition-"]') ??
              header.querySelector<HTMLElement>("strong")!;
            const measureCount = title.nextElementSibling as HTMLElement;
            const titleRect = title.getBoundingClientRect();
            const measureRect = measureCount.getBoundingClientRect();
            const panelRect = panel.getBoundingClientRect();
            return {
              titleCenter: titleRect.top + titleRect.height / 2,
              measureCenter: measureRect.top + measureRect.height / 2,
              panelCenter: panelRect.top + panelRect.height / 2,
              measureBottom: measureRect.bottom,
              panelTop: panelRect.top,
              measureRight: measureRect.right,
              panelLeft: panelRect.left,
            };
          });
          if (viewport.width > 760) {
            expect(Math.abs(rowAlignment.titleCenter - rowAlignment.panelCenter)).toBeLessThan(1);
            expect(Math.abs(rowAlignment.measureCenter - rowAlignment.panelCenter)).toBeLessThan(1);
            expect(rowAlignment.panelLeft).toBeGreaterThanOrEqual(rowAlignment.measureRight - 1);
          } else {
            expect(rowAlignment.panelTop).toBeGreaterThanOrEqual(rowAlignment.measureBottom - 1);
          }
          await page.screenshot({
            path: `test-results/system-note-panel-${viewport.width}x${viewport.height}-${themeName.toLowerCase()}-${gridMode.toLowerCase()}-${paletteMode.toLowerCase()}.png`,
          });
          if (paletteMode === "Chromatic") {
            for (const guidesEnabled of [false, true]) {
              if ((await guidesButton.getAttribute("aria-pressed")) !== String(guidesEnabled)) {
                await guidesButton.click();
              }
              await expect(guidesButton).toHaveAttribute("aria-pressed", String(guidesEnabled));
              for (const zoom of [70, 120, 180]) {
                await zoomControl.evaluate((input, value) => {
                  const setter = Object.getOwnPropertyDescriptor(
                    HTMLInputElement.prototype,
                    "value",
                  )?.set;
                  setter?.call(input, String(value));
                  input.dispatchEvent(new Event("input", { bubbles: true }));
                  input.dispatchEvent(new Event("change", { bubbles: true }));
                }, zoom);
                await expect(zoomControl).toHaveValue(String(zoom));
                const lineGeometry = await page
                  .locator(".piano-roll-grid")
                  .first()
                  .evaluate((grid) => {
                    const bounds = grid.getBoundingClientRect();
                    const lines = Array.from(
                      grid.querySelectorAll<SVGLineElement>(".piano-roll-snap-line"),
                    ).map((line) => ({
                      className: line.getAttribute("class") ?? "",
                      strokeWidth: Number.parseFloat(getComputedStyle(line).strokeWidth),
                      shapeRendering: getComputedStyle(line).shapeRendering,
                      x: line.getBoundingClientRect().left,
                    }));
                    return {
                      gridLeft: bounds.left,
                      gridRight: bounds.right,
                      lines,
                    };
                  });
                expect(lineGeometry.lines.length).toBeGreaterThan(1);
                expect(lineGeometry.lines.every((line) => line.strokeWidth >= 0.8)).toBe(true);
                expect(
                  lineGeometry.lines.every(
                    (line) => line.shapeRendering.toLowerCase() === "crispedges",
                  ),
                ).toBe(true);
                expect(
                  lineGeometry.lines.some((line) => line.className.includes("is-bar-line")),
                ).toBe(true);
                expect(
                  lineGeometry.lines.every(
                    (line) =>
                      line.x >= lineGeometry.gridLeft - 1 && line.x <= lineGeometry.gridRight + 1,
                  ),
                ).toBe(true);
                await expect
                  .poll(() =>
                    page.evaluate(
                      () =>
                        document.documentElement.scrollWidth <=
                        document.documentElement.clientWidth,
                    ),
                  )
                  .toBe(true);
                await page.screenshot({
                  path: `test-results/system-note-panel-${viewport.width}x${viewport.height}-${themeName.toLowerCase()}-${gridMode.toLowerCase()}-${paletteMode.toLowerCase()}-guides-${guidesEnabled ? "on" : "off"}-zoom-${zoom}.png`,
                });
              }
            }
          }
        }
      }
    }
  }
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 640, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    for (const themeName of ["Dark", "Light"] as const) {
      const themeButton = theme.getByRole("button", { name: themeName + " theme" });
      if ((await themeButton.getAttribute("aria-pressed")) !== "true") await themeButton.click();
      for (const gridMode of ["Degrees", "Chromatic"] as const) {
        await page
          .getByRole("group", { name: "Pitch grid" })
          .getByRole("button", { name: gridMode, exact: true })
          .click();
        for (const [kind, selector] of [
          ["note", "button.piano-roll-note"],
          ["chord", ".piano-roll-chord"],
        ] as const) {
          await positionBelowAppHeader(page, selector);
          const bounds = await page
            .locator(selector)
            .first()
            .evaluate((element) => {
              const rect = element.getBoundingClientRect();
              const appHeader = document.querySelector<HTMLElement>(".app-header")!;
              return {
                top: rect.top,
                bottom: rect.bottom,
                headerBottom: appHeader.getBoundingClientRect().bottom,
                viewportHeight: window.innerHeight,
              };
            });
          expect(bounds.top).toBeGreaterThanOrEqual(bounds.headerBottom - 1);
          expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
          await expect(systemPanel).toBeVisible();
          await expect(page.locator("button.piano-roll-note[aria-pressed='true']")).toHaveCount(1);
          await page.screenshot({
            path:
              "test-results/system-note-panel-" +
              viewport.width +
              "x" +
              viewport.height +
              "-" +
              themeName.toLowerCase() +
              "-" +
              gridMode.toLowerCase() +
              "-selected-" +
              kind +
              "-visible.png",
          });
        }
      }
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await firstNote.click();
  await anchorNote.click({ modifiers: ["Shift"] });
  await expect(page.locator("button.piano-roll-note[aria-pressed='true']")).toHaveCount(2);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 640, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    for (const themeName of ["Dark", "Light"] as const) {
      const themeButton = theme.getByRole("button", { name: themeName + " theme" });
      if ((await themeButton.getAttribute("aria-pressed")) !== "true") await themeButton.click();
      for (const gridMode of ["Degrees", "Chromatic"] as const) {
        await page
          .getByRole("group", { name: "Pitch grid" })
          .getByRole("button", { name: gridMode, exact: true })
          .click();
        for (const [kind, selector] of [
          ["note", "button.piano-roll-note"],
          ["chord", ".piano-roll-chord"],
        ] as const) {
          await positionBelowAppHeader(page, selector);
          const bounds = await page
            .locator(selector)
            .first()
            .evaluate((element) => {
              const rect = element.getBoundingClientRect();
              const appHeader = document.querySelector<HTMLElement>(".app-header")!;
              return {
                top: rect.top,
                bottom: rect.bottom,
                headerBottom: appHeader.getBoundingClientRect().bottom,
                viewportHeight: window.innerHeight,
              };
            });
          expect(bounds.top).toBeGreaterThanOrEqual(bounds.headerBottom - 1);
          expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
          await expect(page.locator("button.piano-roll-note[aria-pressed='true']")).toHaveCount(2);
          await page.screenshot({
            path:
              "test-results/system-note-panel-" +
              viewport.width +
              "x" +
              viewport.height +
              "-" +
              themeName.toLowerCase() +
              "-" +
              gridMode.toLowerCase() +
              "-multi-" +
              kind +
              "-visible.png",
          });
        }
      }
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await firstNote.click();
  await expect(page.locator("button.piano-roll-note[aria-pressed='true']")).toHaveCount(1);
  await page.setViewportSize({ width: 1280, height: 720 });
  await systemPanel
    .getByRole("group", { name: "Note palette mode" })
    .getByRole("button", { name: "Degrees", exact: true })
    .click();
  const firstId = await firstNote.getAttribute("data-piano-roll-event-key");
  const anchorId = await anchorNote.getAttribute("data-piano-roll-event-key");
  if (!firstId || !anchorId) throw new Error("Selected notes have no stable event keys");
  const initialFirstPitch = Number(await firstNote.getAttribute("data-pitch-midi"));
  const initialFirstOnset = await firstNote.getAttribute("data-start-beats");
  const initialFirstDuration = await firstNote.getAttribute("data-duration-beats");
  const durationControl = systemPanel.getByLabel("Note duration", { exact: true });
  const tripletControl = systemPanel.getByLabel("Triplet", { exact: true });
  const initialDurationUi = durationUiState(initialFirstDuration ?? "");
  await expect(durationControl).toHaveValue(initialDurationUi.duration);
  if (initialDurationUi.triplet) await expect(tripletControl).toBeChecked();
  else await expect(tripletControl).not.toBeChecked();
  expect(await durationControl.inputValue()).not.toBe("4/1");
  const noOpUndoState = await undoIsEnabled(page);
  const audioStartsBeforeNoOp = await audioStartCount(page);
  await systemPanel.locator(".piano-roll-note-palette > button[aria-pressed='true']").click();
  expect(await audioStartCount(page)).toBe(audioStartsBeforeNoOp);
  const afterNoOpPortable = await exportPortableProject(page);
  expect(portableMelody(afterNoOpPortable, stepId)).toEqual(generatedMelodyBaseline);
  expect(await undoIsEnabled(page)).toBe(noOpUndoState);
  await firstNote.click();

  const changedDuration = initialDurationUi.duration === "1/1" ? "1/2" : "1/1";
  const audioStartsBeforeDuration = await audioStartCount(page);
  await durationControl.selectOption(changedDuration);
  expect(await audioStartCount(page)).toBe(audioStartsBeforeDuration);
  await expect(firstNote).toHaveAttribute("data-duration-beats", changedDuration);
  await historyAction(page, "Undo");
  await expect(firstNote).toHaveAttribute("data-duration-beats", initialFirstDuration ?? "");
  const durationUndoPortable = await exportPortableProject(page);
  expect(portableMelody(durationUndoPortable, stepId)).toEqual(generatedMelodyBaseline);
  await anchorNote.click();
  const initialAnchorDuration = await anchorNote.getAttribute("data-duration-beats");
  const anchorDurationUi = durationUiState(initialAnchorDuration ?? "");
  await expect(durationControl).toHaveValue(anchorDurationUi.duration);
  if (anchorDurationUi.triplet) await expect(tripletControl).toBeChecked();
  else await expect(tripletControl).not.toBeChecked();
  if (anchorDurationUi.duration === "custom") {
    await expect(tripletControl).toBeDisabled();
    await expect(durationControl.locator("option:checked")).toContainText("Current:");
  } else {
    const audioStartsBeforeTriplet = await audioStartCount(page);
    if (anchorDurationUi.triplet) await tripletControl.uncheck();
    else await tripletControl.check();
    expect(await audioStartCount(page)).toBe(audioStartsBeforeTriplet);
    const editedAnchorDuration = anchorDurationUi.triplet
      ? anchorDurationUi.duration
      : tripletDuration(anchorDurationUi.duration);
    await expect(anchorNote).toHaveAttribute("data-duration-beats", editedAnchorDuration);
    await historyAction(page, "Undo");
    await expect(anchorNote).toHaveAttribute("data-duration-beats", initialAnchorDuration ?? "");
    await historyAction(page, "Redo");
    await expect(anchorNote).toHaveAttribute("data-duration-beats", editedAnchorDuration);
    const tripletPortable = await exportPortableProject(page);
    const editedMelody = portableMelody(tripletPortable, stepId);
    expect(editedMelody.mode).toBe("authored");
    expect(portableRecipe(editedMelody)).toEqual(portableRecipe(generatedMelodyBaseline));
    const editedFirst = portableNote(editedMelody, firstId);
    const editedAnchor = portableNote(editedMelody, anchorId);
    expect(editedFirst.pitch.midiNumber).toBe(initialFirstPitch);
    expect(rationalText(editedFirst.onset)).toBe(initialFirstOnset);
    expect(rationalText(editedFirst.duration)).toBe(initialFirstDuration);
    expect(rationalText(editedAnchor.duration)).toBe(editedAnchorDuration);
    await historyAction(page, "Undo");
    expect(portableMelody(await exportPortableProject(page), stepId)).toEqual(
      generatedMelodyBaseline,
    );
    await firstNote.click();
  }

  const generatedNoteIds = await note.evaluateAll((buttons) =>
    buttons
      .map((button) => button.getAttribute("data-piano-roll-event-key"))
      .filter((id): id is string => id !== null),
  );
  const audioStartsBeforePalette = await audioStartCount(page);
  await systemPanel.getByRole("button", { name: "Set selected note to 5·G" }).click();
  expect(await audioStartCount(page)).toBe(audioStartsBeforePalette);
  await expect(firstNote).toHaveAttribute(
    "data-pitch-midi",
    String(Math.floor(initialFirstPitch / 12) * 12 + 7),
  );
  await expect(firstNote).toHaveAttribute("data-start-beats", initialFirstOnset ?? "");
  await expect(firstNote).toHaveAttribute("data-duration-beats", initialFirstDuration ?? "");
  const paletteEditedPortable = await exportPortableProject(page);
  const paletteEditedMelody = portableMelody(paletteEditedPortable, stepId);
  expect(paletteEditedMelody.mode).toBe("authored");
  expect(portableRecipe(paletteEditedMelody)).toEqual(portableRecipe(generatedMelodyBaseline));
  expect(paletteEditedMelody.phrase?.notes.map((storedNote) => storedNote.id).sort()).toEqual(
    [...generatedNoteIds].sort(),
  );
  const paletteEditedFirst = portableNote(paletteEditedMelody, firstId);
  expect(paletteEditedFirst.pitch.midiNumber).toBe(Math.floor(initialFirstPitch / 12) * 12 + 7);
  expect(rationalText(paletteEditedFirst.onset)).toBe(initialFirstOnset);
  expect(rationalText(paletteEditedFirst.duration)).toBe(initialFirstDuration);
  expect(await page.locator(".piano-roll-playhead[data-audition-end-beat]").count()).toBe(0);
  await historyAction(page, "Undo");
  expect(portableMelody(await exportPortableProject(page), stepId)).toEqual(
    generatedMelodyBaseline,
  );
  await firstNote.click();
  await historyAction(page, "Redo");
  const paletteRedoMelody = portableMelody(await exportPortableProject(page), stepId);
  expect(paletteRedoMelody).toEqual(paletteEditedMelody);
  await firstNote.click();
  const pitchBefore = Number(await anchorNote.getAttribute("data-pitch-midi"));
  const firstPitchBefore = Number(await firstNote.getAttribute("data-pitch-midi"));
  const majorSteps = [0, 2, 4, 5, 7, 9, 11];
  const beforePitchClass = pitchBefore % 12;
  const currentScaleIndex = majorSteps.indexOf(beforePitchClass);
  const pitchDelta =
    currentScaleIndex >= 0
      ? ((majorSteps[currentScaleIndex + 1] ?? majorSteps[0]! + 12) as number) - beforePitchClass
      : majorSteps.find((pitchClass) => pitchClass > beforePitchClass)! - beforePitchClass;
  await firstNote.click();
  await anchorNote.click({ modifiers: ["Shift"] });
  await expect(page.locator("button.piano-roll-note[aria-pressed='true']")).toHaveCount(2);
  await expect(systemPanel.getByRole("button", { name: "Next note in scale" })).toBeEnabled();
  const audioStartsBeforeScaleStep = await audioStartCount(page);
  await systemPanel.getByRole("button", { name: "Next note in scale" }).click();
  expect(await audioStartCount(page)).toBe(audioStartsBeforeScaleStep);
  await expect(
    page.locator(`button.piano-roll-note[data-piano-roll-event-key='${anchorId}']`).first(),
  ).toHaveAttribute("data-pitch-midi", String(pitchBefore + pitchDelta));
  await expect(
    page.locator(`button.piano-roll-note[data-piano-roll-event-key='${firstId}']`).first(),
  ).toHaveAttribute("data-pitch-midi", String(firstPitchBefore + pitchDelta));

  const uniqueNotes = () =>
    page
      .locator("button.piano-roll-note")
      .evaluateAll(
        (buttons) =>
          new Set(buttons.map((button) => button.getAttribute("data-piano-roll-event-key"))).size,
      );
  const countBeforeCursor = await uniqueNotes();
  const audioStartsBeforeGroupDuration = await audioStartCount(page);
  await systemPanel.getByLabel("Note duration", { exact: true }).selectOption("1/1");
  expect(await audioStartCount(page)).toBe(audioStartsBeforeGroupDuration);
  const selectedFragments = page.locator("button.piano-roll-note[aria-pressed='true']");
  await expect(selectedFragments.first()).toHaveAttribute("data-duration-beats", "1/1");
  await expect(selectedFragments.last()).toHaveAttribute("data-duration-beats", "1/1");
  const audioStartsBeforeGroupTriplet = await audioStartCount(page);
  await systemPanel.getByLabel("Triplet").check();
  expect(await audioStartCount(page)).toBe(audioStartsBeforeGroupTriplet);
  await expect(selectedFragments.first()).toHaveAttribute("data-duration-beats", "2/3");
  await systemPanel.getByRole("button", { name: "Delete selected notes" }).click();
  await expect(selectedFragments).toHaveCount(0);
  await expect.poll(uniqueNotes).toBe(countBeforeCursor - 2);
  await historyAction(page, "Undo");
  await expect(note.first()).toBeVisible();
  await expect(
    page.locator(`button.piano-roll-note[data-piano-roll-event-key='${anchorId}']`).first(),
  ).toHaveAttribute("data-duration-beats", "2/3");
  await historyAction(page, "Undo");
  await expect(
    page.locator(`button.piano-roll-note[data-piano-roll-event-key='${anchorId}']`).first(),
  ).toHaveAttribute("data-duration-beats", "1/1");
  await historyAction(page, "Undo");
  await expect(
    page.locator(`button.piano-roll-note[data-piano-roll-event-key='${anchorId}']`).first(),
  ).toHaveAttribute("data-duration-beats", "1/2");
  await historyAction(page, "Undo");
  await expect(
    page.locator(`button.piano-roll-note[data-piano-roll-event-key='${anchorId}']`).first(),
  ).toHaveAttribute("data-pitch-midi", String(pitchBefore));
  await historyAction(page, "Undo");
  await expect(firstNote).toHaveAttribute("data-pitch-midi", String(initialFirstPitch));
  await historyAction(page, "Redo");
  await expect(firstNote).toHaveAttribute(
    "data-pitch-midi",
    String(Math.floor(initialFirstPitch / 12) * 12 + 7),
  );
  await historyAction(page, "Redo");
  await expect(firstNote).toHaveAttribute("data-pitch-midi", String(firstPitchBefore + pitchDelta));
  await expect(
    page.locator(`button.piano-roll-note[data-piano-roll-event-key='${anchorId}']`).first(),
  ).toHaveAttribute("data-pitch-midi", String(pitchBefore + pitchDelta));
  await historyAction(page, "Redo");
  await expect(
    page.locator(`button.piano-roll-note[data-piano-roll-event-key='${anchorId}']`).first(),
  ).toHaveAttribute("data-duration-beats", "1/1");
  await historyAction(page, "Redo");
  await expect(
    page.locator(`button.piano-roll-note[data-piano-roll-event-key='${anchorId}']`).first(),
  ).toHaveAttribute("data-duration-beats", "2/3");
  await historyAction(page, "Redo");
  await expect.poll(uniqueNotes).toBe(countBeforeCursor - 2);
  for (let i = 0; i < 5; i += 1) await historyAction(page, "Undo");
  await expect(firstNote).toHaveAttribute("data-pitch-midi", String(initialFirstPitch));

  await firstNote.click();
  await page.getByLabel("Snap resolution").selectOption("1/16 triplet");
  await systemPanel.getByLabel("Note duration", { exact: true }).selectOption("1/2");
  await systemPanel.getByLabel("Triplet").uncheck();
  await historyAction(page, "Undo");
  await historyAction(page, "Undo");
  await expect(firstNote).toHaveAttribute("data-duration-beats", initialFirstDuration ?? "");
  for (const [value, exactDuration] of [
    ["4/1", "4/1"],
    ["2/1", "2/1"],
    ["1/1", "1/1"],
    ["1/4", "1/4"],
  ] as const) {
    await systemPanel.getByLabel("Note duration", { exact: true }).selectOption(value);
    await expect(firstNote).toHaveAttribute("data-duration-beats", exactDuration);
    await historyAction(page, "Undo");
    await expect(firstNote).toHaveAttribute("data-duration-beats", initialFirstDuration ?? "");
  }
  await systemPanel.getByLabel("Note duration", { exact: true }).selectOption("1/2");
  await systemPanel.getByLabel("Note duration", { exact: true }).selectOption("1/4");
  await systemPanel.getByLabel("Note duration", { exact: true }).selectOption("1/2");
  await expect(firstNote).toHaveAttribute("data-duration-beats", "1/2");
  await historyAction(page, "Undo");
  await expect(firstNote).toHaveAttribute("data-duration-beats", "1/4");
  await historyAction(page, "Undo");
  await expect(firstNote).toHaveAttribute("data-duration-beats", initialFirstDuration ?? "");
  await systemPanel.getByLabel("Note duration", { exact: true }).selectOption("1/4");
  await expect(firstNote).toHaveAttribute("data-duration-beats", "1/4");
  await systemPanel.getByLabel("Triplet").check();
  await expect(firstNote).toHaveAttribute("data-duration-beats", "1/6");
  await historyAction(page, "Undo");
  await expect(firstNote).toHaveAttribute("data-duration-beats", "1/4");
  await historyAction(page, "Undo");
  await expect(firstNote).toHaveAttribute("data-duration-beats", initialFirstDuration ?? "");
  await firstNote.click();
  await anchorNote.click({ modifiers: ["Shift"] });
  await expect(page.locator("button.piano-roll-note[aria-pressed='true']")).toHaveCount(2);
  for (let octave = 0; octave < 5; octave += 1) {
    const audioStartsBeforeOctave = await audioStartCount(page);
    await systemPanel.getByRole("button", { name: "Octave up" }).click();
    expect(await audioStartCount(page)).toBe(audioStartsBeforeOctave);
  }
  const firstAtUpperRange = Number(await firstNote.getAttribute("data-pitch-midi"));
  const anchorAtUpperRange = Number(await anchorNote.getAttribute("data-pitch-midi"));
  expect(firstAtUpperRange).toBeLessThanOrEqual(127);
  expect(anchorAtUpperRange).toBeLessThanOrEqual(127);
  const upperRangePortable = await exportPortableProject(page);
  const upperRangeMelody = portableMelody(upperRangePortable, stepId);
  await firstNote.click();
  await anchorNote.click({ modifiers: ["Shift"] });
  const audioStartsBeforeRejectedOctave = await audioStartCount(page);
  await systemPanel.getByRole("button", { name: "Octave up" }).click();
  expect(await audioStartCount(page)).toBe(audioStartsBeforeRejectedOctave);
  await expect(systemPanel.getByRole("status")).toBeVisible();
  await expect(firstNote).toHaveAttribute("data-pitch-midi", String(firstAtUpperRange));
  await expect(anchorNote).toHaveAttribute("data-pitch-midi", String(anchorAtUpperRange));
  const rejectedUpperRangePortable = await exportPortableProject(page);
  expect(portableMelody(rejectedUpperRangePortable, stepId)).toEqual(upperRangeMelody);
  await firstNote.click();
  await anchorNote.click({ modifiers: ["Shift"] });
  await historyAction(page, "Undo");
  await expect(firstNote).toHaveAttribute("data-pitch-midi", String(firstAtUpperRange - 12));
  await expect(anchorNote).toHaveAttribute("data-pitch-midi", String(anchorAtUpperRange - 12));
  const upperRangeUndoMelody = portableMelody(await exportPortableProject(page), stepId);
  expect(portableNote(upperRangeUndoMelody, firstId).pitch.midiNumber).toBe(firstAtUpperRange - 12);
  expect(portableNote(upperRangeUndoMelody, anchorId).pitch.midiNumber).toBe(
    anchorAtUpperRange - 12,
  );
  await firstNote.click();
  await anchorNote.click({ modifiers: ["Shift"] });
  await historyAction(page, "Redo");
  await expect(firstNote).toHaveAttribute("data-pitch-midi", String(firstAtUpperRange));
  await expect(anchorNote).toHaveAttribute("data-pitch-midi", String(anchorAtUpperRange));
  for (let octave = 0; octave < 5; octave += 1) await historyAction(page, "Undo");
  await expect(firstNote).toHaveAttribute("data-pitch-midi", String(initialFirstPitch));
  await expect(anchorNote).toHaveAttribute("data-pitch-midi", String(pitchBefore));

  await firstNote.click();
  await firstNote.press("e");
  const customInspector = page.getByRole("region", { name: "Piano Roll Inspector" });
  await expect(customInspector).toBeVisible();
  await customInspector.getByLabel("Inspector duration denominator").fill("7");
  await customInspector.getByLabel("Inspector duration denominator").press("Enter");
  await customInspector.getByLabel("Inspector duration numerator").fill("3");
  await customInspector.getByLabel("Inspector duration numerator").press("Enter");
  await expect(firstNote).toHaveAttribute("data-duration-beats", "3/7");
  await expect(durationControl.locator("option:checked")).toContainText("Current: 3/7");
  await expect(tripletControl).toBeDisabled();
  await firstNote.click();
  await anchorNote.click({ modifiers: ["Shift"] });
  await expect(durationControl.locator("option:checked")).toHaveText("Mixed");
  await expect(tripletControl).toBeDisabled();
  await historyAction(page, "Undo");
  await historyAction(page, "Undo");
  expect(portableMelody(await exportPortableProject(page), stepId)).toEqual(
    generatedMelodyBaseline,
  );

  const finalChord = page.locator(".piano-roll-chord[data-source-step-id]").last();
  const finalStepId = await finalChord.getAttribute("data-source-step-id");
  if (!finalStepId) throw new Error("Final Step has no stable ID");
  const beforeFinalStepMelody = await exportPortableProject(page);
  const finalStepBeforeCreate = beforeFinalStepMelody.progression.steps.find(
    (candidate) => candidate.id === finalStepId,
  );
  expect(finalStepBeforeCreate?.melody).toBeUndefined();
  const progressionEndBeats = beforeFinalStepMelody.progression.steps.reduce((sum, candidate) => {
    const beats = candidate.duration?.beats;
    return sum + (beats ? beats.numerator / beats.denominator : 0);
  }, 0);
  expect(Number.isInteger(progressionEndBeats)).toBe(true);
  await finalChord.click({ button: "right" });
  await page
    .getByRole("menu", { name: /Melody actions/ })
    .getByRole("menuitem", { name: "Create Melody…" })
    .click();
  await page
    .getByRole("dialog", { name: "Create Melody" })
    .getByRole("button", { name: "Apply Melody" })
    .click();
  const finalNote = page
    .locator("button.piano-roll-note[data-source-step-id='" + finalStepId + "']")
    .last();
  await expect(finalNote).toBeVisible();
  const generatedFinalStepPortable = await exportPortableProject(page);
  const generatedFinalStepMelody = portableMelody(generatedFinalStepPortable, finalStepId);
  expect(generatedFinalStepMelody.mode).toBe("generated");
  await finalNote.scrollIntoViewIfNeeded();
  await finalNote.click();
  await finalNote.press("e");
  const finalInspector = page.getByRole("region", { name: "Piano Roll Inspector" });
  await expect(finalInspector).toBeVisible();
  await finalInspector.getByLabel("Inspector onset denominator").fill("1");
  await finalInspector.getByLabel("Inspector onset denominator").press("Enter");
  await finalInspector
    .getByLabel("Inspector onset numerator")
    .fill(String(progressionEndBeats - 1));
  await finalInspector.getByLabel("Inspector onset numerator").press("Enter");
  const relocatedFinalNote = page
    .locator("button.piano-roll-note[data-source-step-id='" + finalStepId + "']")
    .last();
  await expect(relocatedFinalNote).toHaveAttribute(
    "data-start-beats",
    String(progressionEndBeats - 1) + "/1",
  );
  const inspectorEditedFinalStep = await exportPortableProject(page);
  const inspectorEditedFinalMelody = portableMelody(inspectorEditedFinalStep, finalStepId);
  expect(inspectorEditedFinalMelody.mode).toBe("authored");
  expect(portableRecipe(inspectorEditedFinalMelody)).toEqual(
    portableRecipe(generatedFinalStepMelody),
  );
  const beforeGroupEndRejection = await exportPortableProject(page);
  const firstStepBeforeGroupEndRejection = portableMelody(beforeGroupEndRejection, stepId);
  await firstNote.click();
  await expect(firstNote).toHaveAttribute("aria-pressed", "true");
  await relocatedFinalNote.click({ modifiers: ["Shift"] });
  await expect(firstNote).toHaveAttribute("aria-pressed", "true");
  await expect(relocatedFinalNote).toHaveAttribute("aria-pressed", "true");
  const selectedNotes = await page
    .locator("button.piano-roll-note[aria-pressed='true']")
    .evaluateAll((notes) =>
      notes.map((note) => ({
        sourceStepId: note.getAttribute("data-source-step-id"),
        eventKey: note.getAttribute("data-piano-roll-event-key"),
        label: note.getAttribute("aria-label"),
      })),
    );
  expect(selectedNotes).toHaveLength(2);
  const finalPanel = page.locator("[data-testid^='piano-roll-system-note-panel-']");
  await expect(finalPanel).toHaveCount(1);
  const finalDuration = finalPanel.getByLabel("Note duration", { exact: true });
  const audioStartsBeforeEndRejection = await audioStartCount(page);
  await finalDuration.selectOption("4/1");
  expect(await audioStartCount(page)).toBe(audioStartsBeforeEndRejection);
  await expect(page.getByTestId("duration-resize-status")).toContainText(
    "within the current progression",
  );
  const afterEndRejection = await exportPortableProject(page);
  expect(portableMelody(afterEndRejection, finalStepId)).toEqual(inspectorEditedFinalMelody);
  expect(portableMelody(afterEndRejection, stepId)).toEqual(firstStepBeforeGroupEndRejection);
  await historyAction(page, "Undo");
  expect(portableMelody(await exportPortableProject(page), finalStepId)).toEqual(
    generatedFinalStepMelody,
  );
  await historyAction(page, "Redo");
  expect(portableMelody(await exportPortableProject(page), finalStepId)).toEqual(
    inspectorEditedFinalMelody,
  );
  const notesBeforeCursor = await uniqueNotes();
  const undoBeforeCursor = await undoIsEnabled(page);
  await page.setViewportSize({ width: 640, height: 360 });
  await page.locator(".piano-roll-measure").first().scrollIntoViewIfNeeded();
  const finalCursorGrid = page.getByRole("group", { name: "Melody grid, measure 1" });
  const finalCursorGridBox = await finalCursorGrid.boundingBox();
  if (!finalCursorGridBox) throw new Error("Small-screen Melody grid has no visible bounds");
  await finalCursorGrid.click({
    position: { x: finalCursorGridBox.width * 0.94, y: finalCursorGridBox.height * 0.2 },
  });
  await expect(page.getByTestId("piano-roll-editing-cursor")).toBeVisible();
  await expect(page.locator("[data-testid^='piano-roll-system-note-panel-']")).toHaveCount(0);
  await expect.poll(uniqueNotes).toBe(notesBeforeCursor);
  expect(await undoIsEnabled(page)).toBe(undoBeforeCursor);
  for (const themeName of ["Dark", "Light"] as const) {
    await theme.getByRole("button", { name: `${themeName} theme` }).click();
    for (const gridMode of ["Degrees", "Chromatic"] as const) {
      await page
        .getByRole("group", { name: "Pitch grid" })
        .getByRole("button", { name: gridMode, exact: true })
        .click();
      await expect(systemPanel).toHaveCount(0);
      await page.screenshot({
        path: `test-results/system-note-panel-640x360-${themeName.toLowerCase()}-${gridMode.toLowerCase()}-cursor-only.png`,
      });
    }
  }
});

test("System note palette follows the active tonic, minor scale, alteration and octave", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });
  for (let pass = 0; pass < 2; pass += 1) {
    for (const chord of ["I", "V", "vi", "IV"]) {
      await page
        .getByTestId("chord-card-" + chord)
        .locator(".chord-main")
        .click({ modifiers: ["Control"] });
    }
  }
  await page.getByRole("button", { name: "Set key D", exact: true }).click();
  await page.getByRole("button", { name: /^Dark Harmony/i }).click();
  const confirmSwitch = page.locator(".module-switch-dialog .primary-btn");
  if (await confirmSwitch.isVisible()) await confirmSwitch.click();
  await setProgressionView(page, "staff");
  const step = page.locator("[data-progression-step-select]").first();
  const stepId = await step.getAttribute("data-step-id");
  if (!stepId) throw new Error("D minor Step has no stable ID");
  await step.click({ button: "right" });
  await page
    .getByRole("menu", { name: /Melody actions/ })
    .getByRole("menuitem", { name: "Create Melody…" })
    .click();
  await page
    .getByRole("dialog", { name: "Create Melody" })
    .getByRole("button", { name: "Apply Melody" })
    .click();
  await page.getByTestId("progression-view-btn-piano-roll").click();
  const note = page.locator("button.piano-roll-note[data-source-step-id='" + stepId + "']").first();
  const originalMidi = Number(await note.getAttribute("data-pitch-midi"));
  await note.click();
  const panel = page.getByTestId("piano-roll-system-note-panel-0");
  await expect(panel).toBeVisible();
  await panel
    .getByRole("group", { name: "Note palette mode" })
    .getByRole("button", {
      name: "Chromatic",
      exact: true,
    })
    .click();
  const alteredTarget = Math.floor(originalMidi / 12) * 12 + 1;
  await panel.getByRole("button", { name: "Set selected note to C♯/D♭" }).click();
  await expect(note).toHaveAttribute("data-pitch-midi", String(alteredTarget));
  await panel.getByRole("button", { name: "Next note in scale" }).click();
  await expect(note).toHaveAttribute("data-pitch-midi", String(alteredTarget + 1));
  await panel
    .getByRole("group", { name: "Note palette mode" })
    .getByRole("button", {
      name: "Degrees",
      exact: true,
    })
    .click();
  for (const label of ["1·D", "2·E", "3·F", "4·G", "5·A", "6·A♯", "7·C"]) {
    await expect(
      panel.getByRole("button", { name: "Set selected note to " + label }),
    ).toBeVisible();
  }
  const sameOctaveDegreeSix = Math.floor((alteredTarget + 1) / 12) * 12 + 10;
  await panel.getByRole("button", { name: "Set selected note to 6·A♯" }).click();
  await expect(note).toHaveAttribute("data-pitch-midi", String(sameOctaveDegreeSix));
  const storedProject = await exportPortableProject(page);
  const storedMelody = portableMelody(storedProject, stepId);
  expect(storedMelody.mode).toBe("authored");
  expect(
    portableNote(storedMelody, (await note.getAttribute("data-piano-roll-event-key")) ?? "").pitch
      .midiNumber,
  ).toBe(sameOctaveDegreeSix);
});

test("System note panel edits owner-colliding notes without changing Rest polyphony or project context", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    window.localStorage.clear();
    const audioWindow = window as Window & { __notePanelAudioStarts?: number };
    audioWindow.__notePanelAudioStarts = 0;
    for (const sourceType of [window.AudioBufferSourceNode, window.OscillatorNode]) {
      const prototype = sourceType.prototype as AudioBufferSourceNode & OscillatorNode;
      const originalStart = prototype.start as (...args: number[]) => void;
      prototype.start = function (this: AudioBufferSourceNode & OscillatorNode, ...args: number[]) {
        audioWindow.__notePanelAudioStarts = (audioWindow.__notePanelAudioStarts ?? 0) + 1;
        return originalStart.apply(this, args);
      };
    }
  });

  const fixtureText = encodePortableProject(createOwnerCollisionFixture());
  const canonicalFixture = decodePortableProject(fixtureText);
  const fixtureRest = stepFor(canonicalFixture, "step-3");
  expect(fixtureRest.kind).toBe("rest");
  if (fixtureRest.kind !== "rest") throw new Error("Fixture Rest Step was not decoded");
  const simultaneousRestNotes = fixtureRest.authoredMelody?.notes.filter(
    (note) => rationalText(note.onset) === "0/1",
  );
  expect(simultaneousRestNotes).toHaveLength(2);
  expect(authoredNotesFor(canonicalFixture, "step-1").map((note) => note.id)).toContain(
    SHARED_OWNER_NOTE_ID,
  );
  expect(authoredNotesFor(canonicalFixture, "step-2").map((note) => note.id)).toContain(
    SHARED_OWNER_NOTE_ID,
  );
  expect(authoredNotesFor(canonicalFixture, "step-3").map((note) => note.id)).toContain(
    SHARED_OWNER_NOTE_ID,
  );

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("project-menu-toggle").click();
  await expect(page.getByRole("menu", { name: "Project actions" })).toBeVisible();
  await page.getByTestId("project-open-file-btn").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: "system-note-panel-owner-collision.cadenceflow",
    mimeType: "application/json",
    buffer: Buffer.from(fixtureText, "utf8"),
  });
  await expect(page.getByTestId("project-menu-toggle")).toContainText(
    "System Note Panel Owner Collision Fixture",
  );
  await expect(page.getByTestId("progression-view-btn-piano-roll")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const importedProject = await exportDecodedProject(page, false);
  expect(importedProject).toEqual(canonicalFixture);
  expect(await undoIsEnabled(page)).toBe(false);

  const restHarmony = page.locator('.piano-roll-chord[data-source-step-id="step-3"]');
  await expect(restHarmony).toHaveClass(/is-rest/);
  const firstSelectedNote = page.locator(
    `button.piano-roll-note[data-source-step-id="step-1"][data-piano-roll-event-key="${SHARED_OWNER_NOTE_ID}"]`,
  );
  const restSelectedNote = page.locator(
    `button.piano-roll-note[data-source-step-id="step-3"][data-piano-roll-event-key="${SHARED_OWNER_NOTE_ID}"]`,
  );
  const restPolyphonyNote = page.locator(
    'button.piano-roll-note[data-source-step-id="step-3"][data-piano-roll-event-key="rest-polyphony-companion"]',
  );
  await expect(firstSelectedNote).toHaveCount(1);
  await expect(restSelectedNote).toHaveCount(1);
  await expect(restPolyphonyNote).toHaveCount(1);
  await expect(restSelectedNote).toHaveAttribute("data-start-beats", "8/1");
  await expect(restPolyphonyNote).toHaveAttribute("data-start-beats", "8/1");
  await firstSelectedNote.click({ modifiers: ["Shift"] });
  await restSelectedNote.click({ modifiers: ["Shift"] });
  await expect(page.locator("button.piano-roll-note[aria-pressed='true']")).toHaveCount(2);
  await expect(firstSelectedNote).toHaveAttribute("aria-pressed", "true");
  await expect(restSelectedNote).toHaveAttribute("aria-pressed", "true");
  const panel = page.locator("[data-testid^='piano-roll-system-note-panel-']");
  await expect(panel).toHaveCount(1);
  await expect(panel).toBeVisible();
  const baseline = await exportDecodedProject(page, false, false);
  expect(await undoIsEnabled(page)).toBe(false);

  const initialChordNote = noteFor(baseline, "step-1", SHARED_OWNER_NOTE_ID);
  const initialRestNote = noteFor(baseline, "step-3", SHARED_OWNER_NOTE_ID);
  expect(initialChordNote.pitch.midiNumber).toBe(64);
  expect(initialRestNote.pitch.midiNumber).toBe(72);
  expect(rationalText(initialChordNote.onset)).toBe("0/1");
  expect(rationalText(initialChordNote.duration)).toBe("1/1");
  expect(rationalText(initialRestNote.onset)).toBe("0/1");
  expect(rationalText(initialRestNote.duration)).toBe("1/1");
  const audioStartsBeforePanelActions = await audioStartCount(page);
  expect(audioStartsBeforePanelActions).toBe(0);

  const paletteAction = panel.getByRole("button", { name: "Set selected note to 5·G" });
  await paletteAction.focus();
  await page.keyboard.press("Enter");
  await expect(paletteAction).toBeFocused();
  expect(await audioStartCount(page)).toBe(audioStartsBeforePanelActions);
  await expect(firstSelectedNote).toHaveAttribute("data-pitch-midi", "71");
  await expect(restSelectedNote).toHaveAttribute("data-pitch-midi", "79");
  await page.keyboard.press("Control+z");
  await expect(paletteAction).toBeFocused();
  expect(await audioStartCount(page)).toBe(audioStartsBeforePanelActions);
  const paletteUndo = await exportDecodedProject(page);
  expect(paletteUndo).toEqual(baseline);
  expect(await undoIsEnabled(page)).toBe(false);
  expect(await redoIsEnabled(page)).toBe(true);

  await paletteAction.focus();
  await page.keyboard.press("Control+Shift+z");
  await expect(paletteAction).toBeFocused();
  expect(await audioStartCount(page)).toBe(audioStartsBeforePanelActions);
  const afterPalette = await exportDecodedProject(page);
  const expectedPaletteStepOne = authoredNotesFor(baseline, "step-1").map((note) =>
    note.id === SHARED_OWNER_NOTE_ID
      ? { ...note, pitch: exactPitch(71, { step: "B", alter: 0 }) }
      : note,
  );
  const expectedPaletteRest = authoredNotesFor(baseline, "step-3").map((note) =>
    note.id === SHARED_OWNER_NOTE_ID
      ? { ...note, pitch: exactPitch(79, { step: "G", alter: 0 }) }
      : note,
  );
  expectAuthoredNotesEqual(authoredNotesFor(afterPalette, "step-1"), expectedPaletteStepOne);
  expect(authoredNotesFor(afterPalette, "step-2")).toEqual(authoredNotesFor(baseline, "step-2"));
  expectAuthoredNotesEqual(authoredNotesFor(afterPalette, "step-3"), expectedPaletteRest);
  expect(authoredNotesFor(afterPalette, "step-4")).toEqual(authoredNotesFor(baseline, "step-4"));
  const afterPaletteChord = stepFor(afterPalette, "step-1");
  const baselineChord = stepFor(baseline, "step-1");
  if (
    afterPaletteChord.kind !== "chord" ||
    afterPaletteChord.melody?.mode !== "authored" ||
    baselineChord.kind !== "chord" ||
    baselineChord.melody?.mode !== "authored"
  )
    throw new Error("Portable palette edit lost its authored Step recipe");
  expect({
    ...afterPaletteChord.melody,
    phrase: {
      ...afterPaletteChord.melody.phrase,
      notes: notesById(afterPaletteChord.melody.phrase.notes),
    },
  }).toEqual({
    ...baselineChord.melody,
    phrase: { ...baselineChord.melody.phrase, notes: notesById(expectedPaletteStepOne) },
  });
  expect(stepFor(afterPalette, "step-3").kind).toBe("rest");
  expectProjectContextUnchanged(afterPalette, baseline);
  expect(await undoIsEnabled(page)).toBe(true);
  expect(await redoIsEnabled(page)).toBe(false);

  await paletteAction.focus();
  await page.keyboard.press("Control+z");
  await expect(paletteAction).toBeFocused();
  expect(await audioStartCount(page)).toBe(audioStartsBeforePanelActions);
  expect(await exportDecodedProject(page)).toEqual(baseline);

  const transposeAction = panel.getByRole("button", { name: "Next note in scale" });
  await transposeAction.focus();
  await page.keyboard.press("Space");
  await expect(transposeAction).toBeFocused();
  expect(await audioStartCount(page)).toBe(audioStartsBeforePanelActions);
  await expect(firstSelectedNote).toHaveAttribute("data-pitch-midi", "66");
  await expect(restSelectedNote).toHaveAttribute("data-pitch-midi", "74");
  await page.keyboard.press("Control+z");
  await expect(transposeAction).toBeFocused();
  expect(await audioStartCount(page)).toBe(audioStartsBeforePanelActions);
  expect(await exportDecodedProject(page)).toEqual(baseline);
  expect(await undoIsEnabled(page)).toBe(false);
  expect(await redoIsEnabled(page)).toBe(true);

  await transposeAction.focus();
  await page.keyboard.press("Control+Shift+z");
  await expect(transposeAction).toBeFocused();
  const afterTranspose = await exportDecodedProject(page);
  const expectedTransposeStepOne = authoredNotesFor(baseline, "step-1").map((note) =>
    note.id === SHARED_OWNER_NOTE_ID
      ? { ...note, pitch: exactPitch(66, { step: "F", alter: 1 }) }
      : note,
  );
  const expectedTransposeRest = authoredNotesFor(baseline, "step-3").map((note) =>
    note.id === SHARED_OWNER_NOTE_ID
      ? { ...note, pitch: exactPitch(74, { step: "D", alter: 0 }) }
      : note,
  );
  expectAuthoredNotesEqual(authoredNotesFor(afterTranspose, "step-1"), expectedTransposeStepOne);
  expect(authoredNotesFor(afterTranspose, "step-2")).toEqual(authoredNotesFor(baseline, "step-2"));
  expectAuthoredNotesEqual(authoredNotesFor(afterTranspose, "step-3"), expectedTransposeRest);
  expect(authoredNotesFor(afterTranspose, "step-4")).toEqual(authoredNotesFor(baseline, "step-4"));
  expect(stepFor(afterTranspose, "step-3").kind).toBe("rest");
  expectProjectContextUnchanged(afterTranspose, baseline);
  expect(await undoIsEnabled(page)).toBe(true);
  expect(await redoIsEnabled(page)).toBe(false);
  await transposeAction.focus();
  await page.keyboard.press("Control+z");
  await expect(transposeAction).toBeFocused();
  expect(await exportDecodedProject(page)).toEqual(baseline);

  await transposeAction.focus();
  await page.keyboard.press("Escape");
  await expect(restSelectedNote).toBeFocused();
  expect(await audioStartCount(page)).toBe(audioStartsBeforePanelActions);
  expect(await exportDecodedProject(page, false)).toEqual(baseline);

  const durationControl = panel.getByLabel("Note duration", { exact: true });
  await durationControl.selectOption("1/2");
  expect(await audioStartCount(page)).toBe(audioStartsBeforePanelActions);
  const afterDuration = await exportDecodedProject(page);
  const expectedDurationStepOne = authoredNotesFor(baseline, "step-1").map((note) =>
    note.id === SHARED_OWNER_NOTE_ID ? { ...note, duration: rational(1, 2) } : note,
  );
  const expectedDurationRest = authoredNotesFor(baseline, "step-3").map((note) =>
    note.id === SHARED_OWNER_NOTE_ID ? { ...note, duration: rational(1, 2) } : note,
  );
  expectAuthoredNotesEqual(authoredNotesFor(afterDuration, "step-1"), expectedDurationStepOne);
  expect(authoredNotesFor(afterDuration, "step-2")).toEqual(authoredNotesFor(baseline, "step-2"));
  expectAuthoredNotesEqual(authoredNotesFor(afterDuration, "step-3"), expectedDurationRest);
  expect(authoredNotesFor(afterDuration, "step-4")).toEqual(authoredNotesFor(baseline, "step-4"));
  expect(stepFor(afterDuration, "step-3").kind).toBe("rest");
  expectProjectContextUnchanged(afterDuration, baseline);
  await historyAction(page, "Undo");
  expect(await exportDecodedProject(page)).toEqual(baseline);
  await historyAction(page, "Redo");
  expect(await exportDecodedProject(page)).toEqual(afterDuration);
  await historyAction(page, "Undo");
  expect(await exportDecodedProject(page)).toEqual(baseline);

  await expect(panel.getByRole("button", { name: "Delete selected notes" })).toBeVisible();
  const deleteAction = panel.getByRole("button", { name: "Delete selected notes" });
  await deleteAction.click();
  expect(await audioStartCount(page)).toBe(audioStartsBeforePanelActions);
  await expect(firstSelectedNote).toHaveCount(0);
  await expect(restSelectedNote).toHaveCount(0);
  const afterDelete = await exportDecodedProject(page, false, false);
  expectAuthoredNotesEqual(
    authoredNotesFor(afterDelete, "step-1"),
    authoredNotesFor(baseline, "step-1").filter((note) => note.id !== SHARED_OWNER_NOTE_ID),
  );
  expect(authoredNotesFor(afterDelete, "step-2")).toEqual(authoredNotesFor(baseline, "step-2"));
  expectAuthoredNotesEqual(
    authoredNotesFor(afterDelete, "step-3"),
    authoredNotesFor(baseline, "step-3").filter((note) => note.id !== SHARED_OWNER_NOTE_ID),
  );
  expect(authoredNotesFor(afterDelete, "step-4")).toEqual(authoredNotesFor(baseline, "step-4"));
  expect(stepFor(afterDelete, "step-3").kind).toBe("rest");
  expectProjectContextUnchanged(afterDelete, baseline);
  await historyAction(page, "Undo");
  expect(await exportDecodedProject(page, false, false)).toEqual(baseline);
  await historyAction(page, "Redo");
  expect(await exportDecodedProject(page, false, false)).toEqual(afterDelete);
  expect(await audioStartCount(page)).toBe(audioStartsBeforePanelActions);
});
