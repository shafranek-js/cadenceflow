import { mkdir, readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createEffectiveMelodyTimeline } from "../../src/domain/melody/effectiveTimeline";
import type { Project } from "../../src/domain/project/project";
import { rational } from "../../src/domain/timing/rational";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../src/persistence/portableProject";
import { createPianoRollSystemChordFixture } from "../fixtures/piano-roll-system-chord.fixture";

const CAPTURES = "artifacts/validation/piano-roll-selection-local-targets";

async function openFixture(
  page: Page,
  project: Project,
  beforeProjectImport?: () => Promise<void>,
): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });
  await beforeProjectImport?.();
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: `${project.id}.cadenceflow`,
    mimeType: "application/json",
    buffer: Buffer.from(encodePortableProject(project), "utf8"),
  });
  await expect(page.getByTestId("progression-view-btn-piano-roll")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function scrollBelowAppHeader(page: Page, selector: string): Promise<void> {
  await page.locator(selector).evaluate((element) => {
    const stickyHeader = document.querySelector<HTMLElement>(".app-header");
    const desiredTop = (stickyHeader?.getBoundingClientRect().bottom ?? 0) + 12;
    const delta = element.getBoundingClientRect().top - desiredTop;
    window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: "instant" });
  });
  await expect
    .poll(() =>
      page.locator(selector).evaluate((element) => {
        const stickyHeader = document.querySelector<HTMLElement>(".app-header");
        return (
          element.getBoundingClientRect().top >=
          (stickyHeader?.getBoundingClientRect().bottom ?? 0) + 8
        );
      }),
    )
    .toBe(true);
}

function noteClickAuditionFixture(): Project {
  const source = createPianoRollSystemChordFixture("note-click-audition-fixture");
  const steps = source.progression.steps.map((step) => {
    if (step.id === "chord-a")
      return { ...step, melodyInstrumentOverride: undefined, transpositionSemitones: 2 };
    if (step.id === "generated-e")
      return { ...step, melodyInstrumentOverride: "oboe" as const, transpositionSemitones: -1 };
    if (step.id === "rest-d")
      return { ...step, melodyInstrumentOverride: "clarinet" as const, transpositionSemitones: 1 };
    return step;
  });
  return {
    ...source,
    temporaryBranch: undefined,
    melodyTrack: { ...source.melodyTrack, instrument: "violin", volume: 73 },
    progression: { ...source.progression, steps },
  };
}

async function installNoteClickAuditionMock(page: Page): Promise<void> {
  await page.evaluate(() => {
    type NoteEvent = {
      readonly pitch: number;
      readonly startSeconds: number;
      readonly durationSeconds: number;
      readonly velocity: number;
      readonly channelRole: string;
      readonly instrument?: string;
      readonly eventKey?: string;
      readonly sourceStepId?: string;
    };
    type MockPlayback = { readonly id: string; readonly scheduledAt: number; cancel(): void };
    type MockClock = { now(): number };
    type TargetWindow = Window & {
      __cadenceflow_audio__?: {
        PreviewAuditionController?: {
          prototype: {
            audition: (
              events: readonly NoteEvent[],
              onScheduled?: (playback: MockPlayback, clock: MockClock) => void,
            ) => MockPlayback | null;
          };
        };
        MelodySoundFontProvider?: {
          prototype: {
            prepareForInstruments: (instruments: readonly string[]) => Promise<{
              ready: readonly string[];
              unavailable: readonly string[];
              failed: readonly string[];
            }>;
            setPreviewSettings: (instrument: string, volume: number) => void;
          };
        };
      };
      __noteClickAuditions?: readonly (readonly NoteEvent[])[];
      __noteClickSettings?: readonly { readonly instrument: string; readonly volume: number }[];
      __noteClickPrepareResolve?: (() => void) | undefined;
      __noteClickDeferPrepare?: boolean;
    };
    const target = window as TargetWindow;
    const audio = target.__cadenceflow_audio__;
    const controller = audio?.PreviewAuditionController?.prototype;
    const melody = audio?.MelodySoundFontProvider?.prototype;
    if (!controller || !melody) throw new Error("The guarded audio test hooks are unavailable");
    target.__noteClickAuditions = [];
    target.__noteClickSettings = [];
    controller.audition = (events, onScheduled) => {
      target.__noteClickAuditions = [...(target.__noteClickAuditions ?? []), [...events]];
      const playback = {
        id: `mock-note-click-${target.__noteClickAuditions.length}`,
        scheduledAt: 0,
        cancel: () => undefined,
      };
      onScheduled?.(playback, { now: () => 0 });
      return playback;
    };
    melody.prepareForInstruments = (instruments) => {
      const ready = [...instruments];
      const result = { ready, unavailable: [], failed: [] };
      if (target.__noteClickDeferPrepare)
        return new Promise((resolve) => {
          target.__noteClickPrepareResolve = () => resolve(result);
        });
      return Promise.resolve(result);
    };
    melody.setPreviewSettings = (instrument, volume) => {
      target.__noteClickSettings = [...(target.__noteClickSettings ?? []), { instrument, volume }];
    };
  });
}

async function clearNoteClickAuditionCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as Window & {
      __noteClickAuditions?: readonly unknown[];
      __noteClickSettings?: readonly unknown[];
    };
    target.__noteClickAuditions = [];
    target.__noteClickSettings = [];
  });
}

async function capturedNoteClickAuditions(page: Page) {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __noteClickAuditions?: readonly (readonly {
            readonly pitch: number;
            readonly startSeconds: number;
            readonly channelRole: string;
            readonly instrument?: string;
            readonly eventKey?: string;
            readonly sourceStepId?: string;
          }[])[];
        }
      ).__noteClickAuditions ?? [],
  );
}

async function capturedNoteClickSettings(page: Page) {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __noteClickSettings?: readonly { readonly instrument: string; readonly volume: number }[];
        }
      ).__noteClickSettings ?? [],
  );
}

function restOnlyFixture(projectId: string): Project {
  const project = createPianoRollSystemChordFixture(projectId);
  const rest = project.progression.steps.find((step) => step.id === "rest-d");
  if (!rest || rest.kind !== "rest") throw new Error("The fixture Rest owner is unavailable");
  return {
    ...project,
    temporaryBranch: undefined,
    progression: {
      steps: [rest],
      selectedStepId: rest.id,
      loopRegion: { startStepId: rest.id, endStepId: rest.id },
      sections: [{ id: "ending", name: "Ending", startStepId: rest.id }],
    },
  };
}

async function exportProject(page: Page, clearSelection = true): Promise<Project> {
  if (clearSelection) await page.keyboard.press("Escape");
  const toggle = page.getByTestId("export-menu-toggle");
  if ((await toggle.getAttribute("aria-expanded")) === "true") await toggle.click();
  const downloaded = page.waitForEvent("download");
  await toggle.click();
  await page.getByRole("menu", { name: "Export menu" }).getByTestId("project-export-btn").click();
  const path = await (await downloaded).path();
  if (!path) throw new Error("Portable Project export did not create a file");
  const project = decodePortableProject(await readFile(path, "utf8"));
  if (clearSelection) await page.keyboard.press("Escape");
  return project;
}

async function expectProjectContents(actual: Project, expected: Project): Promise<void> {
  const { updatedAt: _actualUpdatedAt, ...actualContent } = actual;
  const { updatedAt: _expectedUpdatedAt, ...expectedContent } = expected;
  expect(actualContent).toEqual(expectedContent);
}

function withoutImportMetadata(project: Project): Omit<Project, "id" | "name" | "updatedAt"> {
  const { id: _id, name: _name, updatedAt: _updatedAt, ...content } = project;
  return content;
}

async function historyAction(page: Page, action: "Undo" | "Redo"): Promise<void> {
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) })
    .click();
}

async function selectedIdentities(page: Page): Promise<string[]> {
  return page.locator("button.piano-roll-note[aria-pressed='true']").evaluateAll((buttons) => {
    const identities = new Set(
      buttons.map((button) =>
        JSON.stringify([
          (button as HTMLButtonElement).dataset.sourceStepId,
          (button as HTMLButtonElement).dataset.pianoRollEventKey,
        ]),
      ),
    );
    return [...identities];
  });
}

async function renderedIdentities(page: Page): Promise<string[]> {
  return page
    .locator("button.piano-roll-note")
    .evaluateAll((buttons) => [
      ...new Set(
        buttons.map((button) =>
          JSON.stringify([
            (button as HTMLButtonElement).dataset.sourceStepId,
            (button as HTMLButtonElement).dataset.pianoRollEventKey,
          ]),
        ),
      ),
    ]);
}

async function identitiesInside(page: Page, selector: string): Promise<string[]> {
  return page
    .locator(selector)
    .locator("button.piano-roll-note")
    .evaluateAll((buttons) => [
      ...new Set(
        buttons.map((button) =>
          JSON.stringify([
            (button as HTMLButtonElement).dataset.sourceStepId,
            (button as HTMLButtonElement).dataset.pianoRollEventKey,
          ]),
        ),
      ),
    ]);
}

async function marqueeSelectBetweenNotes(
  page: Page,
  startSelector: string,
  endSelector: string,
): Promise<void> {
  const startNote = page.locator(startSelector).first();
  const endNote = page.locator(endSelector).first();
  const startBox = await startNote.boundingBox();
  const endBox = await endNote.boundingBox();
  const startGrid = await startNote
    .locator("xpath=ancestor::*[@data-testid='piano-roll-measure']")
    .locator(".piano-roll-grid")
    .boundingBox();
  const endGrid = await endNote
    .locator("xpath=ancestor::*[@data-testid='piano-roll-measure']")
    .locator(".piano-roll-grid")
    .boundingBox();
  if (!startBox || !endBox || !startGrid || !endGrid)
    throw new Error("The cross-System marquee targets are not visible");
  await page.mouse.move(startGrid.x + startGrid.width * 0.15, startBox.y + startBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(endGrid.x + endGrid.width * 0.42, endBox.y + endBox.height / 2, {
    steps: 14,
  });
  await expect(page.locator(".piano-roll-marquee")).toBeVisible();
  await page.mouse.up();
}

function withCrossSystemMarqueeNotes(project = createPianoRollSystemChordFixture()): Project {
  const steps = project.progression.steps.map((step) => {
    if (step.kind !== "chord" || step.id !== "chord-a" || step.melody?.mode !== "authored")
      return step;
    return {
      ...step,
      melody: {
        ...step.melody,
        phrase: {
          ...step.melody.phrase,
          notes: step.melody.phrase.notes.map((note) =>
            note.id === "owner-local-collision" ? { ...note, onset: rational(1) } : note,
          ),
        },
      },
    };
  });
  return { ...project, progression: { ...project.progression, steps } };
}

test("Piano Roll selects across stacked Systems and scopes effective Melody notes", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 2400 });
  await page.addInitScript(() => {
    window.localStorage.clear();
    const target = window as Window & { __selectionAudioStarts?: number };
    target.__selectionAudioStarts = 0;
    for (const sourceType of [window.AudioBufferSourceNode, window.OscillatorNode]) {
      const prototype = sourceType.prototype as AudioBufferSourceNode & OscillatorNode;
      const originalStart = prototype.start as (...args: number[]) => void;
      prototype.start = function (this: AudioBufferSourceNode & OscillatorNode, ...args: number[]) {
        target.__selectionAudioStarts = (target.__selectionAudioStarts ?? 0) + 1;
        return originalStart.apply(this, args);
      };
    }
  });
  const project = withCrossSystemMarqueeNotes();
  await openFixture(page, project);
  await page.evaluate(() => window.scrollTo(0, 0));
  const measureSelect = page.getByTestId("piano-roll-select-measure-notes-0");
  const scopeIndicator = page.getByTestId("piano-roll-selection-scope");
  const projectBeforeTooltip = await exportProject(page, false);
  const progressionRegion = page.getByRole("region", { name: "My Progression" });
  await expect(measureSelect).toHaveAccessibleName("Select effective Melody notes in Measure 1");
  await expect(progressionRegion.getByTestId("piano-roll-select-all-notes")).toHaveAccessibleName(
    "Select all effective Melody notes in Progression",
  );
  await expect(
    page.getByTestId("piano-roll-toolbar").locator("[data-testid^='piano-roll-select-']"),
  ).toHaveCount(0);
  const progressionSelectionPanel = page.getByTestId("piano-roll-progression-selection");
  await expect(progressionSelectionPanel.locator("xpath=..")).toHaveClass(
    /progression-heading-actions/,
  );
  await expect(progressionSelectionPanel.locator("xpath=following-sibling::*[1]")).toHaveAttribute(
    "data-testid",
    "print-progression",
  );
  await expect(
    progressionSelectionPanel.locator("xpath=ancestor::*[@data-testid='progression-step-cards']"),
  ).toHaveCount(0);
  await expect(page.getByTestId(/^piano-roll-select-measure-notes-/)).toHaveCount(
    await page.locator("[data-testid='piano-roll-measure']").count(),
  );
  await expect(page.getByTestId(/^piano-roll-select-system-notes-/)).toHaveCount(
    await page.getByTestId("progression-score-system").count(),
  );
  await measureSelect.hover();
  const measureHelpId = await measureSelect.getAttribute("aria-describedby");
  expect(measureHelpId).toContain("piano-roll-selection-help-");
  await expect(page.locator(`[id="${measureHelpId}"]`)).toBeVisible();
  await expect(page.getByTestId("piano-roll-selection-help")).toContainText("Measure 1");
  const pointerDismissHelp = page.getByRole("button", {
    name: "Dismiss Piano Roll selection help",
  });
  const measureActionBounds = await measureSelect.boundingBox();
  const pointerDismissBounds = await pointerDismissHelp.boundingBox();
  if (!measureActionBounds || !pointerDismissBounds)
    throw new Error("The selection help trigger or close action is not positioned");
  await page.mouse.move(
    pointerDismissBounds.x + pointerDismissBounds.width / 2,
    pointerDismissBounds.y + pointerDismissBounds.height / 2,
    { steps: 16 },
  );
  await expect(page.getByTestId("piano-roll-selection-help")).toBeVisible();
  await pointerDismissHelp.click();
  await expect(page.getByTestId("piano-roll-selection-help")).toHaveCount(0);
  await expect(measureSelect).toBeFocused();
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: Progression");

  await page.getByTestId("progression-heading").focus();
  await measureSelect.focus();
  const dismissHelp = page.getByRole("button", { name: "Dismiss Piano Roll selection help" });
  await dismissHelp.focus();
  await expect(page.getByTestId("piano-roll-selection-help")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("piano-roll-selection-help")).toHaveCount(0);
  await expect(measureSelect).toBeFocused();
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: Progression");
  await expectProjectContents(await exportProject(page, false), projectBeforeTooltip);

  const startNote = page.locator(
    "button.piano-roll-note[data-source-step-id='chord-a'][data-piano-roll-event-key='owner-local-collision']",
  );
  const endNote = page.locator(
    "button.piano-roll-note[data-source-step-id='chord-c'][data-piano-roll-event-key='section-note']",
  );
  await expect(startNote).toBeVisible();
  await expect(endNote).toBeVisible();
  expect(
    await startNote
      .locator("xpath=ancestor::*[@data-testid='piano-roll-measure']")
      .getAttribute("data-system-index"),
  ).toBe("0");
  expect(
    await endNote
      .locator("xpath=ancestor::*[@data-testid='piano-roll-measure']")
      .getAttribute("data-system-index"),
  ).toBe("1");

  const startMeasure = startNote.locator("xpath=ancestor::*[@data-testid='piano-roll-measure']");
  const endMeasure = endNote.locator("xpath=ancestor::*[@data-testid='piano-roll-measure']");
  const startGrid = startMeasure.locator(".piano-roll-grid");
  const endGrid = endMeasure.locator(".piano-roll-grid");
  const startNoteBox = await startNote.boundingBox();
  const endNoteBox = await endNote.boundingBox();
  const startGridBox = await startGrid.boundingBox();
  const endGridBox = await endGrid.boundingBox();
  if (!startNoteBox || !endNoteBox || !startGridBox || !endGridBox)
    throw new Error("Marquee fixture did not render both note Systems");
  const marqueeStart = {
    x: startGridBox.x + startGridBox.width * 0.15,
    y: startNoteBox.y + startNoteBox.height / 2,
  };
  const marqueeEnd = {
    x: endGridBox.x + endGridBox.width * 0.42,
    y: endNoteBox.y + endNoteBox.height / 2,
  };
  await page.mouse.move(marqueeStart.x, marqueeStart.y);
  await page.mouse.down();
  await page.mouse.move(marqueeEnd.x, marqueeEnd.y, { steps: 18 });
  await expect(page.locator(".piano-roll-marquee")).toBeVisible();
  await page.mouse.up();
  await expect(startNote).toHaveAttribute("aria-pressed", "true");
  await expect(endNote).toHaveAttribute("aria-pressed", "true");
  expect(await selectedIdentities(page)).toEqual(
    expect.arrayContaining([
      JSON.stringify(["chord-a", "owner-local-collision"]),
      JSON.stringify(["chord-c", "section-note"]),
    ]),
  );
  expect(
    await page.evaluate(
      () => (window as Window & { __selectionAudioStarts?: number }).__selectionAudioStarts,
    ),
  ).toBe(0);

  await startNote.click();
  await page.setViewportSize({ width: 1280, height: 640 });
  const studioScroller = page.locator(".studio-grid");
  await studioScroller.evaluate((element) => {
    element.scrollTop = 0;
  });
  await startNote.scrollIntoViewIfNeeded();
  await startGrid.scrollIntoViewIfNeeded();
  await expect(startNote).toHaveAttribute("aria-pressed", "true");
  await expect(endNote).not.toHaveAttribute("aria-pressed", "true");
  await expect(endNote).not.toBeInViewport();
  const autoScrollStartGrid = await startGrid.boundingBox();
  const offscreenEndBox = await endNote.boundingBox();
  if (!autoScrollStartGrid || !offscreenEndBox)
    throw new Error("The auto-scroll marquee fixture did not render both Systems");
  const scrollBeforeMarquee = await studioScroller.evaluate((element) => element.scrollTop);
  const autoScrollStart = {
    x: autoScrollStartGrid.x + autoScrollStartGrid.width * 0.92,
    y: autoScrollStartGrid.y + 100,
  };
  const emptyStartIsNote = await page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y);
    return {
      note: Boolean(hit?.closest("button.piano-roll-note")),
      grid: Boolean(hit?.closest(".piano-roll-grid")),
      hit: hit?.outerHTML.slice(0, 160),
      studioScrollTop: document.querySelector<HTMLElement>(".studio-grid")?.scrollTop ?? 0,
      height: window.innerHeight,
    };
  }, autoScrollStart);
  expect(emptyStartIsNote.note).toBe(false);
  expect(emptyStartIsNote.grid).toBe(true);
  await page.keyboard.down("Shift");
  await page.mouse.move(autoScrollStart.x, autoScrollStart.y);
  await page.mouse.down();
  await page.mouse.move(autoScrollStart.x - 1, autoScrollStart.y + 10, { steps: 1 });
  await expect(page.locator(".piano-roll-marquee")).toBeVisible();
  const endNoteTarget = {
    x: offscreenEndBox.x + offscreenEndBox.width / 2,
    y: 639,
  };
  let reachedVisibleEndNote = false;
  for (let move = 0; move < 120; move += 1) {
    await page.mouse.move(endNoteTarget.x + (move % 2 === 0 ? 1 : -1), endNoteTarget.y, {
      steps: 1,
    });
    const currentEndBox = await endNote.boundingBox();
    const currentScrollport = await studioScroller.boundingBox();
    if (!currentEndBox || !currentScrollport)
      throw new Error("The auto-scroll marquee target or Studio scrollport disappeared");
    const currentCenterY = currentEndBox.y + currentEndBox.height / 2;
    if (
      currentCenterY > Math.max(autoScrollStart.y, currentScrollport.y) &&
      currentCenterY < currentScrollport.y + currentScrollport.height
    ) {
      reachedVisibleEndNote = true;
      break;
    }
  }
  expect(await studioScroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(
    scrollBeforeMarquee,
  );
  expect(
    reachedVisibleEndNote,
    "Auto-scroll brings the target note into the visible scrollport",
  ).toBe(true);
  const scrolledEndBox = await endNote.boundingBox();
  if (!scrolledEndBox) throw new Error("The auto-scroll marquee target disappeared");
  const studioScrollport = await studioScroller.boundingBox();
  if (!studioScrollport) throw new Error("The Studio scrollport disappeared during the marquee");
  const scrolledEndCenterY = scrolledEndBox.y + scrolledEndBox.height / 2;
  expect(scrolledEndCenterY).toBeGreaterThan(Math.max(autoScrollStart.y, studioScrollport.y));
  expect(scrolledEndCenterY).toBeLessThan(studioScrollport.y + studioScrollport.height);
  await page.mouse.move(endNoteTarget.x, scrolledEndCenterY, { steps: 1 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(startNote).toHaveAttribute("aria-pressed", "true");
  await expect(endNote).toHaveAttribute("aria-pressed", "true");

  const systemSelect = page.getByTestId("piano-roll-select-system-notes-0");
  const systemTwoSelect = page.getByTestId("piano-roll-select-system-notes-1");
  const measureTwoSelect = page.getByTestId("piano-roll-select-measure-notes-1");
  const allSelect = page.getByTestId("piano-roll-select-all-notes");
  await expect(measureSelect).toBeEnabled();
  await expect(systemSelect).toBeEnabled();
  const measureTwoHeader = page.locator(
    ".piano-roll-measure[data-measure-index='1'] .piano-roll-measure-header",
  );
  await measureTwoHeader.focus();
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: Measure 2");
  const projectBeforeLocalActions = await exportProject(page, false);
  const cursorBeforeLocalActions = await page
    .locator("[data-testid='piano-roll-midi-cursor']")
    .evaluateAll((cursors) => cursors.map((cursor) => cursor.getAttribute("data-start-beats")));
  const audioBeforeLocalActions = await page.evaluate(
    () => (window as Window & { __selectionAudioStarts?: number }).__selectionAudioStarts ?? 0,
  );
  const editToggle = page.getByTestId("edit-menu-toggle");
  await editToggle.click();
  const historyMenu = page.getByRole("menu", { name: "Edit menu" });
  const undoEnabledBefore = await historyMenu.getByRole("menuitem", { name: /Undo/ }).isEnabled();
  const redoEnabledBefore = await historyMenu.getByRole("menuitem", { name: /Redo/ }).isEnabled();
  await page.keyboard.press("Escape");

  const systemTwoScope = page.getByTestId("piano-roll-system-scope-1");
  await systemTwoScope.focus();
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");
  await measureSelect.focus();
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");
  await page.keyboard.press("Enter");
  expect((await selectedIdentities(page)).sort()).toEqual(
    (await identitiesInside(page, ".piano-roll-measure[data-measure-index='0']")).sort(),
  );
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await measureSelect.click();
  expect((await selectedIdentities(page)).sort()).toEqual(
    (await identitiesInside(page, ".piano-roll-measure[data-measure-index='0']")).sort(),
  );
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");
  await expect(page.getByRole("menu")).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(systemTwoSelect).not.toBeInViewport();
  await systemTwoSelect.scrollIntoViewIfNeeded();
  await expect(systemTwoSelect).toBeInViewport();
  await systemTwoSelect.focus();
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");
  await page.keyboard.press("Space");
  const systemSelection = await selectedIdentities(page);
  expect(systemSelection.sort()).toEqual(
    (await identitiesInside(page, ".score-system[data-system-index='1']")).sort(),
  );
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");

  await measureTwoSelect.focus();
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");
  await page.keyboard.press("Enter");
  expect((await selectedIdentities(page)).sort()).toEqual(
    (await identitiesInside(page, ".piano-roll-measure[data-measure-index='1']")).sort(),
  );
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");

  await allSelect.focus();
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");
  await allSelect.click();
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");

  await allSelect.click();
  const offscreenNote = page.locator(
    "button.piano-roll-note[data-source-step-id='chord-f'][data-piano-roll-event-key='following-note']",
  );
  await expect(offscreenNote).not.toBeInViewport();
  const allEffectiveNoteCount = createEffectiveMelodyTimeline(project).length;
  expect(await selectedIdentities(page)).toHaveLength(allEffectiveNoteCount);
  expect(await exportProject(page, false)).toEqual(projectBeforeLocalActions);
  expect(
    await page
      .locator("[data-testid='piano-roll-midi-cursor']")
      .evaluateAll((cursors) => cursors.map((cursor) => cursor.getAttribute("data-start-beats"))),
  ).toEqual(cursorBeforeLocalActions);
  expect(
    await page.evaluate(
      () => (window as Window & { __selectionAudioStarts?: number }).__selectionAudioStarts ?? 0,
    ),
  ).toBe(audioBeforeLocalActions);
  await editToggle.click();
  const historyMenuAfterLocalActions = page.getByRole("menu", { name: "Edit menu" });
  expect(
    await historyMenuAfterLocalActions.getByRole("menuitem", { name: /Undo/ }).isEnabled(),
  ).toBe(undoEnabledBefore);
  expect(
    await historyMenuAfterLocalActions.getByRole("menuitem", { name: /Redo/ }).isEnabled(),
  ).toBe(redoEnabledBefore);
  await page.keyboard.press("Escape");
  const measureHeader = page.locator(
    ".piano-roll-measure[data-measure-index='0'] .piano-roll-measure-header",
  );
  await measureHeader.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("piano-roll-selection-scope")).toHaveText("Ctrl/Cmd+A: Measure 1");
  await page.keyboard.press("Control+A");
  expect((await selectedIdentities(page)).sort()).toEqual(
    (await identitiesInside(page, ".piano-roll-measure[data-measure-index='0']")).sort(),
  );
  await systemTwoScope.focus();
  await expect(page.getByTestId("piano-roll-selection-scope")).toHaveText("Ctrl/Cmd+A: System 2");
  await page.keyboard.press("Control+A");
  expect((await selectedIdentities(page)).sort()).toEqual(
    (await identitiesInside(page, ".score-system[data-system-index='1']")).sort(),
  );
  await allSelect.click();
  await expect(page.getByTestId("piano-roll-selection-scope")).toHaveText("Ctrl/Cmd+A: System 2");
  expect(await selectedIdentities(page)).toHaveLength(allEffectiveNoteCount);
  await page
    .getByTestId("progression-heading")
    .getByRole("group", { name: "Progression playback controls" })
    .getByRole("button", { name: "Play", exact: true })
    .focus();
  await expect(page.getByTestId("piano-roll-selection-scope")).toHaveText("Ctrl/Cmd+A: System 2");
  const progressionHeading = page.getByTestId("progression-heading");
  await progressionHeading.focus();
  await expect(page.getByTestId("piano-roll-selection-scope")).toHaveText(
    "Ctrl/Cmd+A: Progression",
  );
  await page.keyboard.press("Control+A");
  expect(await selectedIdentities(page)).toHaveLength(allEffectiveNoteCount);
  await allSelect.click();
  await expect(page.getByTestId("piano-roll-selection-scope")).toHaveText(
    "Ctrl/Cmd+A: Progression",
  );
  await systemTwoScope.focus();
  await progressionHeading.scrollIntoViewIfNeeded();
  const commonHeadingClick = await progressionHeading.evaluate((heading) => {
    const bounds = heading.getBoundingClientRect();
    const excluded =
      "button, input, select, textarea, [contenteditable], [role=button], [role=slider], [role=menu], [role^=menuitem], label";
    for (let y = bounds.top + 2; y < bounds.bottom - 2; y += 8) {
      for (let x = bounds.left + 2; x < bounds.right - 2; x += 8) {
        const target = document.elementFromPoint(x, y);
        if (
          target &&
          target.closest("[data-testid='progression-heading']") === heading &&
          !target.closest(excluded)
        )
          return { x, y };
      }
    }
    return null;
  });
  if (!commonHeadingClick)
    throw new Error("The common progression heading has no empty click target");
  await page.mouse.click(commonHeadingClick.x, commonHeadingClick.y);
  await expect(page.getByTestId("piano-roll-selection-scope")).toHaveText(
    "Ctrl/Cmd+A: Progression",
  );
  await page.keyboard.press("Control+A");
  expect(await selectedIdentities(page)).toHaveLength(allEffectiveNoteCount);
  const midiCursorBefore = await page
    .locator("[data-testid='piano-roll-midi-cursor']")
    .evaluateAll((cursors) => cursors.map((cursor) => cursor.getAttribute("data-start-beats")));
  await page.keyboard.press("Control+A");
  expect(await selectedIdentities(page)).toHaveLength(allEffectiveNoteCount);
  expect(
    await page
      .locator("[data-testid='piano-roll-midi-cursor']")
      .evaluateAll((cursors) => cursors.map((cursor) => cursor.getAttribute("data-start-beats"))),
  ).toEqual(midiCursorBefore);

  const beforeInspectorEdit = await exportProject(page);
  await startNote.focus();
  await page.keyboard.press("e");
  const inspectorPitch = page.getByLabel("Inspector pitch MIDI");
  await expect(inspectorPitch).toBeVisible();
  await inspectorPitch.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.insertText("73");
  await expect(inspectorPitch).toHaveValue("73");
  await page.keyboard.press("Escape");
  expect((await exportProject(page)).updatedAt).toBe(beforeInspectorEdit.updatedAt);
});

test("My Progression header selection keeps Piano Roll shortcuts and Undo routed", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 1400 });
  await page.addInitScript(() => window.localStorage.clear());
  await openFixture(page, createPianoRollSystemChordFixture("group-header-select-all-keyboard"));

  const baseline = await exportProject(page, false);
  const allSelect = page.getByTestId("piano-roll-select-all-notes");
  const scopeIndicator = page.getByTestId("piano-roll-selection-scope");
  const systemTwoScope = page.getByTestId("piano-roll-system-scope-1");
  const firstGrid = page.locator(".piano-roll-measure[data-measure-index='0'] .piano-roll-grid");
  const emptyPoint = await firstGrid.evaluate((grid) => {
    const bounds = grid.getBoundingClientRect();
    for (let y = bounds.top + 4; y < bounds.bottom - 4; y += 8) {
      for (let x = bounds.left + 4; x < bounds.right - 4; x += 12) {
        const target = document.elementFromPoint(x, y);
        if (
          target?.closest(".piano-roll-grid") === grid &&
          !target.closest("button.piano-roll-note")
        )
          return { x, y };
      }
    }
    return null;
  });
  if (!emptyPoint) throw new Error("The fixture has no empty Piano Roll cell for a paste cursor");
  await page.mouse.click(emptyPoint.x, emptyPoint.y);
  const cursorBeforeActions = await page
    .locator("[data-testid='piano-roll-midi-cursor']")
    .evaluateAll((cursors) => cursors.map((cursor) => cursor.getAttribute("data-start-beats")));
  expect(cursorBeforeActions).toHaveLength(1);

  await systemTwoScope.focus();
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");
  await allSelect.focus();
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");
  await allSelect.click();
  await expect(allSelect).toBeFocused();
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");
  expect(await selectedIdentities(page)).toHaveLength(
    createEffectiveMelodyTimeline(baseline).length,
  );

  await page.keyboard.press("Control+A");
  expect((await selectedIdentities(page)).sort()).toEqual(
    (await identitiesInside(page, ".score-system[data-system-index='1']")).sort(),
  );
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");
  await page.keyboard.press("Control+C");
  await expect(allSelect).toBeFocused();
  expect(await renderedIdentities(page)).toHaveLength(
    createEffectiveMelodyTimeline(baseline).length,
  );

  await allSelect.click();
  await page.keyboard.press("Delete");
  await expect(page.locator("button.piano-roll-note")).toHaveCount(0);
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");
  await page.keyboard.press("Control+z");
  await expect(allSelect).toBeFocused();
  await expect
    .poll(async () => (await renderedIdentities(page)).length)
    .toBe(createEffectiveMelodyTimeline(baseline).length);
  await allSelect.click();
  await expect(allSelect).toBeFocused();
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");
  await page.keyboard.press("Control+X");
  await expect(page.locator("button.piano-roll-note")).toHaveCount(0);
  await expect(allSelect).toBeFocused();
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");
  await page.keyboard.press("Control+v");
  await expect
    .poll(async () => (await renderedIdentities(page)).length)
    .toBe(createEffectiveMelodyTimeline(baseline).length);
  await expect(allSelect).toBeFocused();
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");
  await page.keyboard.press("Control+z");
  await expect(page.locator("button.piano-roll-note")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await renderedIdentities(page)).length)
    .toBe(createEffectiveMelodyTimeline(baseline).length);
  await expect(scopeIndicator).toHaveText("Ctrl/Cmd+A: System 2");
  expect(
    await page
      .locator("[data-testid='piano-roll-midi-cursor']")
      .evaluateAll((cursors) => cursors.map((cursor) => cursor.getAttribute("data-start-beats"))),
  ).toEqual(cursorBeforeActions);
  await expectProjectContents(await exportProject(page, false), baseline);
});

test("group keyboard and pointer moves, copy, paste, duplicate and delete commit atomically", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    window.localStorage.clear();
    (
      window as Window & { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
  const project = createPianoRollSystemChordFixture("group-edit-atomic-fixture");
  await openFixture(page, project, () => installNoteClickAuditionMock(page));
  const initialCount = createEffectiveMelodyTimeline(project).length;
  const first = page
    .locator(
      "button.piano-roll-note[data-source-step-id='chord-a'][data-piano-roll-event-key='owner-local-collision']",
    )
    .first();
  const second = page
    .locator(
      "button.piano-roll-note[data-source-step-id='chord-a'][data-piano-roll-event-key='cross-system-carry']",
    )
    .first();
  const initialPitch = Number(await first.getAttribute("data-pitch-midi"));
  const secondInitialPitch = Number(await second.getAttribute("data-pitch-midi"));
  await first.click();
  await expect.poll(async () => (await capturedNoteClickAuditions(page)).length).toBe(1);
  await second.click({ modifiers: ["Shift"] });
  expect(await capturedNoteClickAuditions(page)).toHaveLength(1);
  await clearNoteClickAuditionCapture(page);
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(second).toHaveAttribute("aria-pressed", "true");

  await first.focus();
  await page.keyboard.press("ArrowUp");
  await expect(first).toHaveAttribute("data-pitch-midi", String(initialPitch + 1));
  await expect(second).toHaveAttribute("data-pitch-midi", String(secondInitialPitch + 1));
  const keyboardMoved = await exportProject(page, false);
  const movedFirst = createEffectiveMelodyTimeline(keyboardMoved).find(
    (note) => note.sourceStepId === "chord-a" && note.eventKey === "owner-local-collision",
  );
  expect(movedFirst?.pitch.midiNumber).toBe(initialPitch + 1);
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(second).toHaveAttribute("aria-pressed", "true");

  const firstAfterKeyboard = page
    .locator(
      "button.piano-roll-note[data-source-step-id='chord-a'][data-piano-roll-event-key='owner-local-collision']",
    )
    .first();
  await page.getByTestId("piano-roll-toolbar").getByRole("button", { name: "Chromatic" }).click();
  await firstAfterKeyboard.scrollIntoViewIfNeeded();
  const noteBox = await firstAfterKeyboard.boundingBox();
  const measure = firstAfterKeyboard.locator(
    "xpath=ancestor::*[@data-testid='piano-roll-measure']",
  );
  const currentPitch = Number(await firstAfterKeyboard.getAttribute("data-pitch-midi"));
  const destinationRow = measure
    .locator(`.piano-roll-row[data-pitch-midi='${currentPitch + 1}']`)
    .first();
  const targetRowBox = await destinationRow.boundingBox();
  if (!noteBox || !targetRowBox) throw new Error("The group-move pitch target is not visible");
  expect(noteBox.y).toBeGreaterThanOrEqual(0);
  expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(900);
  await page.mouse.move(noteBox.x + noteBox.width / 2, noteBox.y + noteBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(noteBox.x + noteBox.width / 2, targetRowBox.y + targetRowBox.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(firstAfterKeyboard).toHaveAttribute("data-pitch-midi", String(currentPitch + 1));
  await expect(second).toHaveAttribute("data-pitch-midi", String(secondInitialPitch + 2));
  await expect(firstAfterKeyboard).toHaveAttribute("aria-pressed", "true");
  await expect(second).toHaveAttribute("aria-pressed", "true");

  const horizontalNoteBox = await firstAfterKeyboard.boundingBox();
  const horizontalGridBox = await measure.locator(".piano-roll-grid").boundingBox();
  if (!horizontalNoteBox || !horizontalGridBox)
    throw new Error("The group-time target is not visible");
  const dragStartX = horizontalNoteBox.x + horizontalNoteBox.width / 2;
  const dragY = horizontalNoteBox.y + horizontalNoteBox.height / 2;
  await page.mouse.move(dragStartX, dragY);
  await page.mouse.down();
  await page.mouse.move(dragStartX + horizontalGridBox.width / 8, dragY, { steps: 10 });
  await page.mouse.up();
  await expect(firstAfterKeyboard).toHaveAttribute("data-start-beats", "1/2");
  const crossOwnerMove = page.locator(
    "button.piano-roll-note[data-source-step-id='chord-b'][data-piano-roll-event-key='cross-system-carry']",
  );
  await expect(crossOwnerMove.first()).toHaveAttribute("data-start-beats", "4/1");
  await expect(firstAfterKeyboard).toHaveAttribute("aria-pressed", "true");
  await expect(crossOwnerMove.first()).toHaveAttribute("aria-pressed", "true");

  await firstAfterKeyboard.focus();
  await page.keyboard.press("Control+C");
  const insertionMeasure = page.locator(".piano-roll-measure[data-measure-index='1']");
  await insertionMeasure.scrollIntoViewIfNeeded();
  const insertionGrid = insertionMeasure.locator(".piano-roll-grid");
  const insertionBox = await insertionGrid.boundingBox();
  if (!insertionBox) throw new Error("The paste target Measure is not visible");
  await page.mouse.click(
    insertionBox.x + insertionBox.width / 2,
    insertionBox.y + insertionBox.height / 2,
  );
  const midiCursorAtPaste = await page
    .locator("[data-testid='piano-roll-midi-cursor']")
    .first()
    .getAttribute("data-start-beats");
  await insertionGrid.focus();
  await page.keyboard.press("Control+V");
  await expect.poll(async () => (await renderedIdentities(page)).length).toBe(initialCount + 2);
  expect(
    await page
      .locator("[data-testid='piano-roll-midi-cursor']")
      .first()
      .getAttribute("data-start-beats"),
  ).toBe(midiCursorAtPaste);

  await insertionGrid.focus();
  await page.keyboard.press("Control+D");
  await expect.poll(async () => (await renderedIdentities(page)).length).toBe(initialCount + 4);
  await insertionGrid.focus();
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await renderedIdentities(page)).length).toBe(initialCount + 2);
  await historyAction(page, "Undo");
  await expect.poll(async () => (await renderedIdentities(page)).length).toBe(initialCount + 4);
  await historyAction(page, "Redo");
  await expect.poll(async () => (await renderedIdentities(page)).length).toBe(initialCount + 2);
  expect(await capturedNoteClickAuditions(page)).toHaveLength(0);

  const beforeCancelledDrag = await exportProject(page, false);
  await firstAfterKeyboard.click();
  await crossOwnerMove.first().click({ modifiers: ["Shift"] });
  await expect.poll(async () => (await capturedNoteClickAuditions(page)).length).toBe(1);
  await clearNoteClickAuditionCapture(page);
  const cancelPitch = Number(await firstAfterKeyboard.getAttribute("data-pitch-midi"));
  await firstAfterKeyboard.scrollIntoViewIfNeeded();
  const cancelNoteBox = await firstAfterKeyboard.boundingBox();
  const cancelMeasure = firstAfterKeyboard.locator(
    "xpath=ancestor::*[@data-testid='piano-roll-measure']",
  );
  const cancelTarget = cancelMeasure
    .locator(`.piano-roll-row[data-pitch-midi='${cancelPitch + 1}']`)
    .first();
  const cancelTargetBox = await cancelTarget.boundingBox();
  if (!cancelNoteBox || !cancelTargetBox) throw new Error("The cancel target is not visible");
  await page.mouse.move(
    cancelNoteBox.x + cancelNoteBox.width / 2,
    cancelNoteBox.y + cancelNoteBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    cancelNoteBox.x + cancelNoteBox.width / 2,
    cancelTargetBox.y + cancelTargetBox.height / 2,
    { steps: 8 },
  );
  await expect(cancelMeasure.locator(".piano-roll-grid")).toHaveClass(/is-note-moving/);
  await page.keyboard.press("Escape");
  await expect(cancelMeasure.locator(".piano-roll-grid")).not.toHaveClass(/is-note-moving/);
  await page.mouse.up();
  await expect(firstAfterKeyboard).toHaveAttribute("data-pitch-midi", String(cancelPitch));
  expect(await capturedNoteClickAuditions(page)).toHaveLength(0);
  const afterCancelledDrag = await exportProject(page, false);
  expect(afterCancelledDrag.updatedAt).toBe(beforeCancelledDrag.updatedAt);
  expect(afterCancelledDrag.progression.steps).toEqual(beforeCancelledDrag.progression.steps);

  await firstAfterKeyboard.click();
  await crossOwnerMove.first().click({ modifiers: ["Shift"] });
  await expect.poll(async () => (await capturedNoteClickAuditions(page)).length).toBe(1);
  await clearNoteClickAuditionCapture(page);
  const stalePitch = Number(await firstAfterKeyboard.getAttribute("data-pitch-midi"));
  await firstAfterKeyboard.scrollIntoViewIfNeeded();
  const staleNoteBox = await firstAfterKeyboard.boundingBox();
  const staleMeasure = firstAfterKeyboard.locator(
    "xpath=ancestor::*[@data-testid='piano-roll-measure']",
  );
  const staleTarget = staleMeasure
    .locator(`.piano-roll-row[data-pitch-midi='${stalePitch + 1}']`)
    .first();
  const staleTargetBox = await staleTarget.boundingBox();
  if (!staleNoteBox || !staleTargetBox) throw new Error("The stale-session target is not visible");
  await page.mouse.move(
    staleNoteBox.x + staleNoteBox.width / 2,
    staleNoteBox.y + staleNoteBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    staleNoteBox.x + staleNoteBox.width / 2,
    staleTargetBox.y + staleTargetBox.height / 2,
    { steps: 8 },
  );
  await expect(staleMeasure.locator(".piano-roll-grid")).toHaveClass(/is-note-moving/);
  const beforeConcurrentEdit = await renderedIdentities(page);
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await renderedIdentities(page)).length)
    .toBe(beforeConcurrentEdit.length + 1);
  const afterConcurrentEdit = await renderedIdentities(page);
  await expect(staleMeasure.locator(".piano-roll-grid")).not.toHaveClass(/is-note-moving/);
  await page.mouse.up();
  await expect.poll(async () => await renderedIdentities(page)).toEqual(afterConcurrentEdit);
  await expect(firstAfterKeyboard).toHaveAttribute("data-pitch-midi", String(stalePitch));
  expect(await capturedNoteClickAuditions(page)).toHaveLength(0);
});

test("global Delete works from the selection toolbar, scoped Ctrl+A header, and cross-System marquee", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1920, height: 2400 });
  await openFixture(
    page,
    withCrossSystemMarqueeNotes(createPianoRollSystemChordFixture("group-global-delete-focus")),
  );
  const baseline = await exportProject(page, false);
  const allNotes = await renderedIdentities(page);

  const measureSelection = await identitiesInside(
    page,
    ".piano-roll-measure[data-measure-index='0']",
  );
  const selectMeasure = page.getByTestId("piano-roll-select-measure-notes-0");
  await selectMeasure.click();
  expect((await selectedIdentities(page)).sort()).toEqual(measureSelection.sort());
  await page.keyboard.press("Delete");
  const afterMeasureDelete = await exportProject(page, false);
  expect(createEffectiveMelodyTimeline(afterMeasureDelete)).toHaveLength(
    allNotes.length - measureSelection.length,
  );
  await historyAction(page, "Undo");
  expect(await exportProject(page)).toEqual(baseline);
  await historyAction(page, "Redo");
  expect(createEffectiveMelodyTimeline(await exportProject(page, false))).toHaveLength(
    allNotes.length - measureSelection.length,
  );
  await historyAction(page, "Undo");
  expect(await exportProject(page)).toEqual(baseline);

  const systemHeaderScope = page.getByTestId("piano-roll-system-scope-1");
  await systemHeaderScope.focus();
  await page.keyboard.press("Control+A");
  const systemSelection = await identitiesInside(page, ".score-system[data-system-index='1']");
  expect((await selectedIdentities(page)).sort()).toEqual(systemSelection.sort());
  await page.keyboard.press("Delete");
  const afterSystemDelete = await exportProject(page, false);
  expect(createEffectiveMelodyTimeline(afterSystemDelete)).toHaveLength(
    allNotes.length - systemSelection.length,
  );
  await historyAction(page, "Undo");
  expect(await exportProject(page)).toEqual(baseline);
  await historyAction(page, "Redo");
  expect(createEffectiveMelodyTimeline(await exportProject(page, false))).toHaveLength(
    allNotes.length - systemSelection.length,
  );
  await historyAction(page, "Undo");
  expect(await exportProject(page)).toEqual(baseline);

  await page.evaluate(() => window.scrollTo(0, 0));
  await marqueeSelectBetweenNotes(
    page,
    "button.piano-roll-note[data-source-step-id='chord-a'][data-piano-roll-event-key='owner-local-collision']",
    "button.piano-roll-note[data-source-step-id='chord-c'][data-piano-roll-event-key='section-note']",
  );
  const marqueeSelection = await selectedIdentities(page);
  expect(marqueeSelection.length).toBeGreaterThan(1);
  expect(marqueeSelection.some((identity) => identity.includes("chord-a"))).toBe(true);
  expect(marqueeSelection.some((identity) => identity.includes("chord-c"))).toBe(true);
  await page.getByTestId("piano-roll-system-scope-1").focus();
  expect(await selectedIdentities(page)).toEqual(marqueeSelection);
  await page.keyboard.press("Delete");
  const afterMarqueeDelete = await exportProject(page, false);
  expect(createEffectiveMelodyTimeline(afterMarqueeDelete)).toHaveLength(
    allNotes.length - marqueeSelection.length,
  );
  await historyAction(page, "Undo");
  expect(await exportProject(page)).toEqual(baseline);
  await historyAction(page, "Redo");
  expect(createEffectiveMelodyTimeline(await exportProject(page, false))).toHaveLength(
    allNotes.length - marqueeSelection.length,
  );
});

test("Ctrl+X cuts globally in one step and Ctrl+V survives both undos with automatic extension", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.addInitScript(() => {
    window.localStorage.clear();
    const target = window as Window & { __cutAudioStarts?: number };
    target.__cutAudioStarts = 0;
    for (const sourceType of [window.AudioBufferSourceNode, window.OscillatorNode]) {
      const prototype = sourceType.prototype as AudioBufferSourceNode & OscillatorNode;
      const originalStart = prototype.start as (...args: number[]) => void;
      prototype.start = function (this: AudioBufferSourceNode & OscillatorNode, ...args: number[]) {
        target.__cutAudioStarts = (target.__cutAudioStarts ?? 0) + 1;
        return originalStart.apply(this, args);
      };
    }
  });
  const project = createPianoRollSystemChordFixture("group-cut-clipboard-history");
  await openFixture(page, project);
  const baseline = await exportProject(page, false);
  const sourceNotes = createEffectiveMelodyTimeline(baseline);
  const selectAll = page.getByTestId("piano-roll-select-all-notes");
  await selectAll.focus();
  await expect(selectAll).toBeFocused();
  await selectAll.click();
  expect(await selectedIdentities(page)).toHaveLength(sourceNotes.length);
  await page.keyboard.press("Control+X");
  const cutProject = await exportProject(page, false);
  expect(createEffectiveMelodyTimeline(cutProject)).toHaveLength(0);

  const finalGrid = page.locator(".piano-roll-measure[data-measure-index='5'] .piano-roll-grid");
  await finalGrid.scrollIntoViewIfNeeded();
  const finalGridBox = await finalGrid.boundingBox();
  if (!finalGridBox) throw new Error("The final Measure insertion grid is not visible");
  await page.mouse.click(
    finalGridBox.x + finalGridBox.width - 2,
    finalGridBox.y + finalGridBox.height / 2,
  );
  await page.getByTestId("piano-roll-system-scope-2").focus();
  await page.keyboard.press("Control+V");
  await expect.poll(async () => (await renderedIdentities(page)).length).toBe(sourceNotes.length);
  await expect
    .poll(async () => page.locator("[data-testid='piano-roll-measure']").count())
    .toBeGreaterThan(6);
  const afterPaste = await exportProject(page, false);
  expect(createEffectiveMelodyTimeline(afterPaste)).toHaveLength(sourceNotes.length);
  expect(afterPaste.progression.steps.length).toBeGreaterThan(baseline.progression.steps.length);

  await historyAction(page, "Undo");
  await expectProjectContents(await exportProject(page, false), cutProject);
  await historyAction(page, "Undo");
  await expectProjectContents(await exportProject(page, false), baseline);

  const otherGrid = page.locator(".piano-roll-measure[data-measure-index='1'] .piano-roll-grid");
  await otherGrid.scrollIntoViewIfNeeded();
  const otherGridBox = await otherGrid.boundingBox();
  if (!otherGridBox) throw new Error("The other Measure insertion grid is not visible");
  await page.mouse.click(
    otherGridBox.x + otherGridBox.width / 2,
    otherGridBox.y + otherGridBox.height / 2,
  );
  await selectAll.focus();
  await page.keyboard.press("Control+V");
  const clipboardAfterUndoCut = await exportProject(page, false);
  expect(createEffectiveMelodyTimeline(clipboardAfterUndoCut)).toHaveLength(sourceNotes.length * 2);
  await openFixture(page, clipboardAfterUndoCut);
  expect(createEffectiveMelodyTimeline(await exportProject(page))).toHaveLength(
    sourceNotes.length * 2,
  );
  expect(
    await page.evaluate(() => (window as Window & { __cutAudioStarts?: number }).__cutAudioStarts),
  ).toBe(0);
});

test("Escape clears only transient Piano Roll note selection and preserves Project selection/history", async ({
  page,
}) => {
  const project = createPianoRollSystemChordFixture("group-selection-escape-state");
  await openFixture(page, project);
  const before = await exportProject(page, false);
  const note = page
    .locator(
      "button.piano-roll-note[data-source-step-id='chord-a'][data-piano-roll-event-key='owner-local-collision']",
    )
    .first();
  await note.click();
  await expect(note).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(note).toHaveAttribute("aria-pressed", "false");

  const after = await exportProject(page, false);
  expect(after).toEqual(before);
  await page.getByTestId("edit-menu-toggle").click();
  const editMenu = page.getByRole("menu", { name: "Edit menu" });
  await expect(editMenu.getByRole("menuitem", { name: "Undo" })).toBeDisabled();
  await expect(editMenu.getByRole("menuitem", { name: "Redo" })).toBeDisabled();
});

test("paste at the final barline appends a full Measure in the same Undo/Redo and survives portable reopen", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const project = restOnlyFixture("group-paste-growth-portable");
  await openFixture(page, project);
  const baseline = await exportProject(page);
  await expect(page.locator("[data-testid='piano-roll-measure']")).toHaveCount(1);
  const sourceNote = page
    .locator(
      "button.piano-roll-note[data-source-step-id='rest-d'][data-piano-roll-event-key='rest-polyphony']",
    )
    .first();
  await sourceNote.click();
  await page.keyboard.press("Control+C");

  const grid = page.locator(".piano-roll-measure[data-measure-index='0'] .piano-roll-grid");
  await grid.scrollIntoViewIfNeeded();
  const box = await grid.boundingBox();
  if (!box) throw new Error("The final Measure grid is not visible");
  await page.mouse.click(box.x + box.width - 1, box.y + box.height / 2);
  await grid.focus();
  await page.keyboard.press("Control+V");

  await expect(page.locator("[data-testid='piano-roll-measure']")).toHaveCount(2);
  const pastedNote = page.locator(
    ".piano-roll-measure[data-measure-index='1'] button.piano-roll-note[aria-pressed='true']",
  );
  await expect(pastedNote).toHaveCount(1);
  const afterPaste = await exportProject(page);
  expect(afterPaste.progression.steps).toHaveLength(2);
  const extension = afterPaste.progression.steps.at(-1);
  expect(extension?.kind).toBe("rest");
  expect(extension?.kind === "rest" && extension.authoredMelody?.notes).toHaveLength(1);
  const timeline = createEffectiveMelodyTimeline(afterPaste);
  expect(
    timeline.some((note) => note.sourceStepId === "rest-d" && note.eventKey === "rest-polyphony"),
  ).toBe(true);

  await historyAction(page, "Undo");
  await expectProjectContents(await exportProject(page, false), baseline);
  await expect(page.locator("[data-testid='piano-roll-measure']")).toHaveCount(1);
  await historyAction(page, "Redo");
  const redone = await exportProject(page, false);
  expect(redone.progression.steps).toEqual(afterPaste.progression.steps);
  await openFixture(page, redone);
  expect(withoutImportMetadata(await exportProject(page, false))).toEqual(
    withoutImportMetadata(redone),
  );
});

test("ordinary completed note clicks audition the effective Melody once and cancelled gestures stay silent", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    window.localStorage.clear();
    (
      window as Window & { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
  const project = noteClickAuditionFixture();
  await openFixture(page, project, () => installNoteClickAuditionMock(page));
  const baseline = await exportProject(page, false);

  const generated = createEffectiveMelodyTimeline(project).find(
    (note) => note.sourceStepId === "generated-e",
  );
  if (!generated) throw new Error("The fixture generated Melody is unavailable");
  const targets = [
    { sourceStepId: "chord-a", eventKey: "owner-local-collision" },
    { sourceStepId: generated.sourceStepId, eventKey: generated.eventKey },
    { sourceStepId: "rest-d", eventKey: "rest-polyphony" },
  ] as const;
  for (const { sourceStepId, eventKey } of targets) {
    const expected = createEffectiveMelodyTimeline(project).find(
      (note) => note.sourceStepId === sourceStepId && note.eventKey === eventKey,
    );
    if (!expected) throw new Error(`The fixture note ${sourceStepId}/${eventKey} is unavailable`);
    const note = page
      .locator(
        `button.piano-roll-note[data-source-step-id='${sourceStepId}'][data-piano-roll-event-key='${eventKey}']`,
      )
      .first();
    await note.scrollIntoViewIfNeeded();
    await expect(note).toBeVisible();
    await expect(note).toBeInViewport();
    await clearNoteClickAuditionCapture(page);
    const box = await note.boundingBox();
    if (!box) throw new Error(`The fixture note ${sourceStepId}/${eventKey} has no bounds`);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    expect(await capturedNoteClickAuditions(page)).toHaveLength(0);
    await page.mouse.up();
    await expect.poll(async () => (await capturedNoteClickAuditions(page)).length).toBe(1);

    const auditions = await capturedNoteClickAuditions(page);
    expect(auditions).toHaveLength(1);
    expect(auditions[0]).toHaveLength(1);
    expect(auditions[0]?.[0]).toMatchObject({
      pitch: expected.pitch.midiNumber,
      channelRole: "melody",
      instrument: expected.instrument,
      sourceStepId,
      eventKey,
    });
    expect(await capturedNoteClickSettings(page)).toEqual([
      { instrument: expected.instrument, volume: 73 },
    ]);
  }

  await clearNoteClickAuditionCapture(page);
  const additive = page
    .locator(
      "button.piano-roll-note[data-source-step-id='chord-c'][data-piano-roll-event-key='section-note']",
    )
    .first();
  await additive.click({ modifiers: ["Shift"] });
  expect(await capturedNoteClickAuditions(page)).toHaveLength(0);
  expect(await capturedNoteClickSettings(page)).toHaveLength(0);

  const cancelled = page
    .locator(
      "button.piano-roll-note[data-source-step-id='chord-a'][data-piano-roll-event-key='owner-local-collision']",
    )
    .first();
  await cancelled.scrollIntoViewIfNeeded();
  await expect(cancelled).toBeInViewport();
  const cancelBox = await cancelled.boundingBox();
  if (!cancelBox) throw new Error("The cancelled-drag note has no bounds");
  await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + cancelBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    cancelBox.x + cancelBox.width / 2 + 28,
    cancelBox.y + cancelBox.height / 2,
    {
      steps: 4,
    },
  );
  await expect(page.locator(".piano-roll-grid.is-note-moving").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".piano-roll-grid.is-note-moving")).toHaveCount(0);
  expect(await capturedNoteClickAuditions(page)).toHaveLength(0);
  expect(await capturedNoteClickSettings(page)).toHaveLength(0);
  await expectProjectContents(await exportProject(page, false), baseline);

  await clearNoteClickAuditionCapture(page);
  await page.evaluate(() => {
    const target = window as Window & { __noteClickDeferPrepare?: boolean };
    target.__noteClickDeferPrepare = true;
  });
  await cancelled.click();
  await page.waitForFunction(
    () =>
      typeof (window as Window & { __noteClickPrepareResolve?: unknown })
        .__noteClickPrepareResolve === "function",
  );
  await page.getByTestId("progression-view-btn-tablature").click();
  await expect(page.getByTestId("progression-view-btn-tablature")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("piano-roll-progression-selection")).toHaveCount(0);
  await expect(page.getByTestId(/^piano-roll-select-measure-notes-/)).toHaveCount(0);
  await expect(page.getByTestId(/^piano-roll-select-system-notes-/)).toHaveCount(0);
  await page.evaluate(() => {
    const target = window as Window & { __noteClickPrepareResolve?: () => void };
    target.__noteClickPrepareResolve?.();
  });
  await expect.poll(async () => (await capturedNoteClickAuditions(page)).length).toBe(0);
  expect(await capturedNoteClickSettings(page)).toHaveLength(0);
  await expectProjectContents(await exportProject(page, false), {
    ...baseline,
    presentation: { ...baseline.presentation, progressionView: "tablature" },
  });
});

test("Piano Roll selection stays legible at target viewports, themes and pitch grids", async ({
  page,
}) => {
  test.setTimeout(360_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() => window.localStorage.clear());
  await openFixture(page, createPianoRollSystemChordFixture("group-selection-capture-fixture"));
  await mkdir(CAPTURES, { recursive: true });
  const first = page
    .locator(
      "button.piano-roll-note[data-source-step-id='chord-a'][data-piano-roll-event-key='owner-local-collision']",
    )
    .first();
  const crossSystem = page
    .locator(
      "button.piano-roll-note[data-source-step-id='chord-c'][data-piano-roll-event-key='section-note']",
    )
    .first();
  await first.click();
  await crossSystem.click({ modifiers: ["Shift"] });

  for (const viewport of [
    { width: 640, height: 360 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ["Dark", "Light"] as const) {
      const themeButton = page.getByRole("button", { name: `${theme} theme` });
      if ((await themeButton.getAttribute("aria-pressed")) !== "true") await themeButton.click();
      for (const gridMode of ["Degrees", "Chromatic"] as const) {
        const modeButton = page
          .getByTestId("piano-roll-toolbar")
          .getByRole("button", { name: gridMode, exact: true });
        if ((await modeButton.getAttribute("aria-pressed")) !== "true") await modeButton.click();
        if (theme === "Dark" && gridMode === "Degrees") {
          const heading = page.getByTestId("progression-heading");
          await scrollBelowAppHeader(page, "[data-testid='progression-heading']");
          const headingLayout = await heading.evaluate((element) => {
            const rect = (selector: string) => {
              const target = element.querySelector<HTMLElement>(selector);
              if (!target) return null;
              const bounds = target.getBoundingClientRect();
              return {
                x: bounds.x,
                y: bounds.y,
                right: bounds.right,
                bottom: bounds.bottom,
                width: bounds.width,
                height: bounds.height,
                clientWidth: target.clientWidth,
                scrollWidth: target.scrollWidth,
              };
            };
            const bounds = element.getBoundingClientRect();
            const title = rect(".progression-title-group h2");
            const transportButtons = Array.from(
              element.querySelectorAll<HTMLElement>(
                ".progression-transport-controls .transport-button",
              ),
            ).map((button) => {
              const buttonBounds = button.getBoundingClientRect();
              return { y: buttonBounds.y, bottom: buttonBounds.bottom };
            });
            const actions = element.querySelector<HTMLElement>(".progression-heading-actions");
            const actionChildren = Array.from(actions?.children ?? []).map((child) => {
              const childBounds = child.getBoundingClientRect();
              return {
                x: childBounds.x,
                y: childBounds.y,
                right: childBounds.right,
                bottom: childBounds.bottom,
              };
            });
            const selectAll = element
              .querySelector<HTMLElement>("[data-testid='piano-roll-select-all-notes']")
              ?.getBoundingClientRect();
            const print = element
              .querySelector<HTMLElement>("[data-testid='print-progression']")
              ?.getBoundingClientRect();
            return {
              viewportWidth: window.innerWidth,
              documentWidth: document.documentElement.scrollWidth,
              heading: { x: bounds.x, right: bounds.right },
              titleGroup: rect(".progression-title-group"),
              actionsGroup: rect(".progression-heading-actions"),
              title,
              titleLineHeight: title
                ? Number.parseFloat(getComputedStyle(element.querySelector("h2")!).lineHeight)
                : null,
              transportButtons,
              tempo: rect(".progression-heading-tempo"),
              tempoInput: rect(".progression-heading-tempo .tempo-input-group"),
              support: rect(".progression-heading-support-controls"),
              actionChildren,
              selectAll: selectAll
                ? {
                    x: selectAll.x,
                    y: selectAll.y,
                    right: selectAll.right,
                    bottom: selectAll.bottom,
                  }
                : null,
              print: print ? { x: print.x, y: print.y, bottom: print.bottom } : null,
            };
          });
          expect(headingLayout.documentWidth).toBeLessThanOrEqual(headingLayout.viewportWidth + 1);
          expect(headingLayout.titleGroup).not.toBeNull();
          expect(headingLayout.actionsGroup).not.toBeNull();
          const titleAndActionsShareRow =
            headingLayout.titleGroup!.y < headingLayout.actionsGroup!.bottom - 1 &&
            headingLayout.actionsGroup!.y < headingLayout.titleGroup!.bottom - 1;
          expect(titleAndActionsShareRow).toBe(false);
          expect(headingLayout.title).not.toBeNull();
          expect(headingLayout.title!.height).toBeLessThanOrEqual(
            (headingLayout.titleLineHeight ?? 0) + 2,
          );
          expect(headingLayout.tempoInput).not.toBeNull();
          expect(headingLayout.tempoInput!.scrollWidth).toBeLessThanOrEqual(
            headingLayout.tempoInput!.clientWidth + 1,
          );
          expect(headingLayout.transportButtons.length).toBeGreaterThan(0);
          for (const button of headingLayout.transportButtons)
            expect(Math.abs(button.y - headingLayout.transportButtons[0]!.y)).toBeLessThanOrEqual(
              1,
            );
          expect(headingLayout.selectAll).not.toBeNull();
          expect(headingLayout.print).not.toBeNull();
          expect(headingLayout.selectAll!.right).toBeLessThanOrEqual(headingLayout.print!.x + 1);
          expect(headingLayout.selectAll!.y).toBeLessThan(headingLayout.print!.bottom);
          expect(headingLayout.print!.y).toBeLessThan(headingLayout.selectAll!.bottom);
          for (let leftIndex = 0; leftIndex < headingLayout.actionChildren.length; leftIndex++) {
            const left = headingLayout.actionChildren[leftIndex]!;
            expect(left.x).toBeGreaterThanOrEqual(headingLayout.heading.x - 1);
            expect(left.right).toBeLessThanOrEqual(headingLayout.heading.right + 1);
            for (
              let rightIndex = leftIndex + 1;
              rightIndex < headingLayout.actionChildren.length;
              rightIndex++
            ) {
              const right = headingLayout.actionChildren[rightIndex]!;
              const overlapsVertically = left.y < right.bottom - 1 && right.y < left.bottom - 1;
              const overlapsHorizontally = left.x < right.right - 1 && right.x < left.right - 1;
              expect(overlapsVertically && overlapsHorizontally).toBe(false);
            }
          }
          await page.screenshot({
            path: `${CAPTURES}/header-${viewport.width}x${viewport.height}.png`,
            fullPage: false,
          });
          if (viewport.width === 640) {
            await scrollBelowAppHeader(page, ".progression-heading-actions");
            await page.screenshot({
              path: `${CAPTURES}/header-actions-${viewport.width}x${viewport.height}.png`,
              fullPage: false,
            });
          }
        }
        const selectionControls = [
          ...(await page.getByTestId(/^piano-roll-select-measure-notes-/).all()),
          ...(await page.getByTestId(/^piano-roll-select-system-notes-/).all()),
          page.getByTestId("piano-roll-select-all-notes"),
          page.getByTestId("piano-roll-selection-scope"),
        ];
        for (const control of selectionControls) {
          await control.scrollIntoViewIfNeeded();
          await expect(control).toBeVisible();
          await expect(control).toBeInViewport();
        }
        const localAndGlobalActions = [
          ...(await page.getByTestId(/^piano-roll-select-measure-notes-/).all()),
          ...(await page.getByTestId(/^piano-roll-select-system-notes-/).all()),
          page.getByTestId("piano-roll-select-all-notes"),
        ];
        for (const action of localAndGlobalActions) {
          await action.focus();
          const helpId = await action.getAttribute("aria-describedby");
          expect(helpId).toContain("piano-roll-selection-help-");
          const help = page.locator(`[id="${helpId}"]`);
          await expect(help).toBeVisible();
          const helpBounds = await help.boundingBox();
          if (!helpBounds) throw new Error("The selection infotip is not positioned");
          expect(helpBounds.x).toBeGreaterThanOrEqual(0);
          expect(helpBounds.y).toBeGreaterThanOrEqual(0);
          expect(helpBounds.x + helpBounds.width).toBeLessThanOrEqual(viewport.width);
          expect(helpBounds.y + helpBounds.height).toBeLessThanOrEqual(viewport.height);
          await page.getByRole("button", { name: "Dismiss Piano Roll selection help" }).click();
          await expect(help).toHaveCount(0);
        }
        await page.mouse.move(0, 0);
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        });

        const visibleSelectedNote = page
          .locator("button.piano-roll-note[aria-pressed='true']")
          .first();
        await visibleSelectedNote.scrollIntoViewIfNeeded();
        await expect(visibleSelectedNote).toBeInViewport({ ratio: 0.1 });
        const bounds = await page.evaluate(() => ({
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          toolbar: document
            .querySelector<HTMLElement>("[data-testid='piano-roll-toolbar']")
            ?.getBoundingClientRect(),
          note: document
            .querySelector<HTMLElement>("button.piano-roll-note[aria-pressed='true']")
            ?.getBoundingClientRect(),
        }));
        expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.viewportWidth + 1);
        expect(bounds.toolbar).toBeDefined();
        expect(bounds.note).toBeDefined();
        expect(bounds.note!.right).toBeGreaterThan(0);
        expect(bounds.note!.left).toBeLessThan(viewport.width);
        expect(bounds.note!.bottom).toBeGreaterThan(0);
        expect(bounds.note!.top).toBeLessThan(viewport.height);
        await page.screenshot({
          path: `${CAPTURES}/${theme.toLowerCase()}-${gridMode.toLowerCase()}-${viewport.width}x${viewport.height}.png`,
          fullPage: false,
        });
      }
    }
  }

  const normalHeaderSource = createPianoRollSystemChordFixture("normal-header-capture-fixture");
  const normalHeaderProject = {
    ...normalHeaderSource,
    temporaryBranch: undefined,
    presentation: { ...normalHeaderSource.presentation, sidePanelMode: "autohide" as const },
  };
  await openFixture(page, normalHeaderProject);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.mouse.move(0, 0);
  await expect(page.locator(".studio-grid")).toHaveClass(/is-collapsed/);
  await expect(page.locator(".studio-grid.is-collapsed .inspector-stack")).toBeHidden();
  await expect(page.locator(".branch-controls.active")).toHaveCount(0);
  await scrollBelowAppHeader(page, "[data-testid='progression-heading']");
  const regularHeaderLayout = await page.getByTestId("progression-heading").evaluate((element) => {
    const bounds = (selector: string) => {
      const target = element.querySelector<HTMLElement>(selector);
      if (!target) return null;
      const rect = target.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
    };
    return {
      title: bounds(".progression-title-group"),
      support: bounds(".progression-heading-support-controls"),
      selectAll: bounds("[data-testid='piano-roll-select-all-notes']"),
      print: bounds("[data-testid='print-progression']"),
    };
  });
  expect(regularHeaderLayout.title).not.toBeNull();
  expect(regularHeaderLayout.support).not.toBeNull();
  expect(regularHeaderLayout.selectAll).not.toBeNull();
  expect(regularHeaderLayout.print).not.toBeNull();
  expect(
    regularHeaderLayout.title!.y < regularHeaderLayout.print!.bottom &&
      regularHeaderLayout.print!.y < regularHeaderLayout.title!.bottom,
  ).toBe(true);
  expect(regularHeaderLayout.support!.right).toBeLessThanOrEqual(regularHeaderLayout.selectAll!.x);
  expect(regularHeaderLayout.selectAll!.right).toBeLessThanOrEqual(regularHeaderLayout.print!.x);
  await page.screenshot({
    path: `${CAPTURES}/header-1920x1080-no-branch-no-inspector.png`,
    fullPage: false,
  });
});
