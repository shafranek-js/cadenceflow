import { decodePortableProject } from "../../src/persistence/portableProject";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createEffectiveMelodyTimeline } from "../../src/domain/melody/effectiveTimeline";
import { addRational, rational, subtractRational } from "../../src/domain/timing/rational";
import { setLayoutMeasuresPerSystem } from "./test-helpers/progression-settings";

async function historyAction(page: import("@playwright/test").Page, action: "Undo" | "Redo") {
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) })
    .click();
}

async function undoIsEnabled(page: import("@playwright/test").Page) {
  await page.getByTestId("edit-menu-toggle").click();
  const enabled = await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: /Undo/ })
    .isEnabled();
  await page.keyboard.press("Escape");
  return enabled;
}

type PortableRational = { numerator: number; denominator: number };
type PortableMelodyNote = {
  id: string;
  pitch: { midiNumber: number };
  onset: PortableRational;
  duration: PortableRational;
};
type PortableStep = {
  id: string;
  kind: string;
  melody?: {
    mode: "generated" | "authored";
    recipe?: unknown;
    sourceRecipe?: unknown;
    phrase?: {
      notes: PortableMelodyNote[];
      sourceRecipe?: unknown;
    };
  };
};
type PortableProject = { progression: { steps: PortableStep[] } };

async function exportPortableProject(
  page: import("@playwright/test").Page,
): Promise<PortableProject> {
  await page.keyboard.press("Escape");
  const exportToggle = page.getByTestId("export-menu-toggle");
  if ((await exportToggle.getAttribute("aria-expanded")) === "true") await exportToggle.click();
  const projectDownload = page.waitForEvent("download");
  await exportToggle.click();
  const exportMenu = page.getByRole("menu", { name: "Export menu" });
  await expect(exportMenu).toBeVisible();
  await exportMenu.getByTestId("project-export-btn").click();
  const download = await projectDownload;
  await page.keyboard.press("Escape");
  const path = await download.path();
  if (!path) throw new Error("Could not read portable Project download");
  return JSON.parse(await readFile(path, "utf8")) as PortableProject;
}

function portableStep(project: PortableProject, id: string): PortableStep {
  const step = project.progression.steps.find((candidate) => candidate.id === id);
  if (!step) throw new Error(`Portable Project omitted Step ${id}`);
  return step;
}

function portableRecipe(step: PortableStep): unknown {
  return step.melody?.mode === "generated"
    ? step.melody.recipe
    : (step.melody?.sourceRecipe ?? step.melody?.phrase?.sourceRecipe);
}

function expectedPitchFromFrozenC4Geometry(
  midiRange: { min: number; max: number },
  gridMode: "Degrees" | "Chromatic",
  gridTop: number,
  gridHeight: number,
  unitCount: number,
  pointerY: number,
): number {
  const majorSteps = [0, 2, 4, 5, 7, 9, 11];
  const coordinate = (midi: number) => {
    if (gridMode === "Chromatic") return midi;
    const relativePitchClass = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12);
    const exactStep = majorSteps.indexOf(relativePitchClass);
    if (exactStep >= 0) return octave * 7 + exactStep;
    let lowerStep = 0;
    for (let index = 0; index < majorSteps.length; index += 1) {
      if (majorSteps[index]! < relativePitchClass) lowerStep = index;
    }
    return octave * 7 + lowerStep + 0.5;
  };
  const topCoordinate = coordinate(midiRange.max);
  const targetY = ((pointerY - gridTop) / gridHeight) * unitCount;
  let expected = midiRange.min;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let midi = 0; midi <= 127; midi += 1) {
    const centerY = topCoordinate - coordinate(midi) + 0.5;
    const distance = Math.abs(centerY - targetY);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      expected = midi;
    }
  }
  return expected;
}

test("Piano Roll directly edits generated notes and preserves transactional editing", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => window.localStorage.clear());
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
  await page.getByTestId("progression-view-btn-staff").click();
  const stepId = await page
    .locator("[data-progression-step-select]")
    .first()
    .getAttribute("data-step-id");
  if (!stepId) throw new Error("First Step has no stable ID");
  const first = page.locator("[data-progression-step-select]").first();
  await first.click({ button: "right" });
  await page
    .getByRole("menu", { name: /Melody actions/ })
    .getByRole("menuitem", { name: "Create Melody…" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Create Melody" });
  await dialog.getByRole("button", { name: "Apply Melody" }).click();
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

  const undoEnabledBeforePreview = await undoIsEnabled(page);
  const transportStatus = page.getByTestId("transport-status");
  const statusBeforePreview = await transportStatus.textContent();
  await expect(page.getByTestId("score-system-audition-0")).toBeVisible();
  await expect(page.locator("[data-testid^='score-system-audition-']")).toHaveCount(8);
  await page.getByTestId("score-system-audition-0").click();
  await expect(transportStatus).toHaveText(statusBeforePreview ?? "");
  await expect(page.locator(".progression-track")).toHaveAttribute("data-audition-end-beat", "4");
  const activeSystemPlayhead = page.locator(".piano-roll-playhead[data-audition-end-beat]");
  await expect(activeSystemPlayhead).toBeVisible();
  await expect(activeSystemPlayhead).toHaveAttribute("data-audition-end-beat", "4");
  const systemPlayheadPosition = await activeSystemPlayhead.getAttribute("style");
  await page.waitForTimeout(120);
  await expect(activeSystemPlayhead).not.toHaveAttribute("style", systemPlayheadPosition ?? "");
  await page.getByTestId("piano-roll-measure").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/piano-roll-system-audition-playhead.png" });
  expect(await undoIsEnabled(page)).toBe(undoEnabledBeforePreview);
  await setLayoutMeasuresPerSystem(page, 2);
  await expect(page.locator("[data-testid^='score-system-audition-']")).toHaveCount(4);
  await page.getByTestId("score-system-audition-1").focus();
  await page.keyboard.press("Space");
  await expect(transportStatus).toHaveText(statusBeforePreview ?? "");
  await expect(activeSystemPlayhead.first()).toHaveAttribute("data-audition-end-beat", "16");
  const activeSystemPlayheadEnds = await activeSystemPlayhead.evaluateAll((playheads) =>
    playheads.map((playhead) => playhead.getAttribute("data-audition-end-beat")),
  );
  expect(activeSystemPlayheadEnds.length).toBeGreaterThan(0);
  expect(activeSystemPlayheadEnds.every((end) => end === "16")).toBe(true);
  expect(await undoIsEnabled(page)).toBe(undoEnabledBeforePreview);
  await expect(page.getByTestId("piano-roll-audition-measure").first()).toBeVisible();
  await page.getByTestId("piano-roll-audition-measure").first().focus();
  await page.keyboard.press("Enter");
  await expect(transportStatus).toHaveText(statusBeforePreview ?? "");
  const measurePlayhead = page.locator(".piano-roll-playhead[data-audition-end-beat='4']");
  await expect(measurePlayhead).toBeVisible();
  expect(await undoIsEnabled(page)).toBe(undoEnabledBeforePreview);
  await expect(measurePlayhead).toBeHidden({ timeout: 3000 });
  await setLayoutMeasuresPerSystem(page, 1);

  const generated = page.locator(
    `button.piano-roll-note[data-source-step-id='${stepId}'][data-generated='true']`,
  );
  await expect(generated.first()).toBeVisible();
  const generatedCount = await generated.count();
  await generated.first().click({ force: true });
  await expect(page.locator("button.piano-roll-note[aria-pressed='true']")).toHaveCount(1);
  await expect(page.locator(".piano-roll-chord.is-selected")).toHaveCount(0);
  if (generatedCount > 1) {
    await generated.nth(1).click({ force: true });
    await expect(page.locator("button.piano-roll-note[aria-pressed='true']")).toHaveCount(1);
  }
  const notePlayhead = page.getByTestId("piano-roll-playhead");
  await expect(notePlayhead).toBeVisible();
  await expect(page.getByRole("button", { name: /Convert generated Melody/ })).toHaveCount(0);
  await generated.first().focus();
  await page.keyboard.press("Alt+ArrowUp");
  const authored = page.locator(
    `button.piano-roll-note[data-source-step-id='${stepId}'][data-generated='false']`,
  );
  await expect(authored).toHaveCount(generatedCount);
  await historyAction(page, "Undo");
  await expect(generated.first()).toBeVisible();
  await historyAction(page, "Redo");
  await expect(authored).toHaveCount(generatedCount);
  await page
    .locator(`.piano-roll-chord[data-source-step-id='${stepId}']`)
    .first()
    .click({ button: "right" });
  await page
    .getByRole("menu", { name: /Melody actions/ })
    .getByRole("menuitem", { name: "Return to generated Melody" })
    .click();
  await expect(generated.first()).toBeVisible();
  await historyAction(page, "Undo");
  await expect(authored).toHaveCount(generatedCount);
  await historyAction(page, "Redo");
  await expect(generated.first()).toBeVisible();
  await historyAction(page, "Undo");
  await expect(authored).toHaveCount(generatedCount);

  const generatedSecond = page.locator(
    `button.piano-roll-note[data-source-step-id='${secondStepId}'][data-generated='true']`,
  );
  await expect(generatedSecond.first()).toBeVisible();
  const destinationStart = await page
    .locator(`.piano-roll-chord[data-source-step-id='${secondStepId}']`)
    .first()
    .getAttribute("data-start-beats");
  if (!destinationStart) throw new Error("Step 2 has no absolute timeline start");
  await generatedSecond.first().focus();
  await page.keyboard.press("Alt+ArrowUp");
  const authoredSecond = page.locator(
    `button.piano-roll-note[data-source-step-id='${secondStepId}'][data-generated='false']`,
  );
  const secondAuthoredCount = await authoredSecond.count();
  expect(secondAuthoredCount).toBeGreaterThan(0);
  const grid = page.locator(".piano-roll-grid").first();
  await grid.focus();
  await historyAction(page, "Undo");
  await expect(generatedSecond.first()).toBeVisible();
  await historyAction(page, "Redo");
  await expect(authoredSecond).toHaveCount(secondAuthoredCount);

  await grid.scrollIntoViewIfNeeded();
  const emptyCell = await grid.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    for (let y = 8; y < rect.height; y += 14) {
      for (let x = 40; x < rect.width - 4; x += 18) {
        const target = document.elementFromPoint(rect.left + x, rect.top + y);
        if (target?.closest(".piano-roll-row") && !target.closest("button.piano-roll-note"))
          return { x, y };
      }
    }
    return null;
  });
  if (!emptyCell) throw new Error("No empty Piano Roll cell was found for the create gesture");
  const gridRect = await grid.boundingBox();
  if (!gridRect) throw new Error("Piano Roll grid has no visible bounds");
  await page.evaluate(() => {
    (window as Window & { __pianoRollDblClick?: string }).__pianoRollDblClick = "none";
    document.addEventListener(
      "dblclick",
      (event) => {
        (window as Window & { __pianoRollDblClick?: string }).__pianoRollDblClick =
          (event.target as HTMLElement).className?.toString() ?? "no-class";
      },
      true,
    );
    document.addEventListener("keydown", (event) => {
      (window as Window & { __rollKeys?: string[] }).__rollKeys?.push(
        `bubble:${event.key}|shift=${event.shiftKey}|prevented=${event.defaultPrevented}`,
      );
    });
  });
  await page.mouse.dblclick(gridRect.x + emptyCell.x, gridRect.y + emptyCell.y);
  const dblclickTarget = await page.evaluate(
    () => (window as Window & { __pianoRollDblClick?: string }).__pianoRollDblClick,
  );
  // Empty grid cells resolve to the grid container because rows are positioned
  // children and do not cover the full interactive surface.
  expect(dblclickTarget).toContain("piano-roll-grid");
  const transactionStatus = page.getByTestId("duration-resize-status");
  if (await transactionStatus.isVisible()) {
    throw new Error(
      `Piano Roll create transaction failed: ${await transactionStatus.textContent()}`,
    );
  }
  const created = page.locator(
    `button.piano-roll-note[data-source-step-id='${stepId}'][data-generated='false']`,
  );
  await expect(created).toHaveCount(generatedCount + 1);
  const createdButton = created.last();
  const noteId = await createdButton.getAttribute("data-piano-roll-event-key");
  if (!noteId) throw new Error("Created authored note has no stable identity");
  const authoredNote = page.locator(
    `button.piano-roll-note[data-piano-roll-event-key='${noteId}']`,
  );
  await createdButton.click();
  await createdButton.press("e");
  const inspector = page.getByRole("region", { name: "Piano Roll Inspector" });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText("Overlapping notes")).toBeVisible();
  const originalPitch = Number(await createdButton.getAttribute("data-pitch-midi"));
  await inspector.getByLabel("Inspector pitch MIDI").fill(String(originalPitch + 1));
  await inspector.getByLabel("Inspector pitch MIDI").press("Enter");
  await expect(authoredNote).toHaveAttribute("data-pitch-midi", String(originalPitch + 1));
  await page.keyboard.press("Escape");
  await expect(inspector).toHaveCount(0);
  await authoredNote.click();
  await historyAction(page, "Undo");
  await expect(authoredNote).toHaveAttribute("data-pitch-midi", String(originalPitch));

  const allAuthored = page.locator("button.piano-roll-note[data-generated='false']");
  const allAuthoredCount = await allAuthored.count();
  await authoredNote.click();
  await page.keyboard.press("Control+d");
  await expect(allAuthored).toHaveCount(allAuthoredCount + 1);
  await historyAction(page, "Undo");
  await expect(allAuthored).toHaveCount(allAuthoredCount);
  await historyAction(page, "Redo");
  await expect(allAuthored).toHaveCount(allAuthoredCount + 1);
  await historyAction(page, "Undo");
  await expect(allAuthored).toHaveCount(allAuthoredCount);

  const multiA = authored.nth(0);
  const multiB = authored.nth(1);
  await multiA.click();
  await multiB.click({ modifiers: ["Shift"] });
  await expect(
    page.locator("button.piano-roll-note[data-generated='false'][aria-pressed='true']"),
  ).toHaveCount(2);
  await page.keyboard.press("Control+c");
  const pasteGrid = page.locator(".piano-roll-measure[data-measure-index='1'] .piano-roll-grid");
  await pasteGrid.scrollIntoViewIfNeeded();
  const pasteBox = await pasteGrid.boundingBox();
  if (!pasteBox) throw new Error("The clipboard paste target is not visible");
  await page.mouse.click(pasteBox.x + pasteBox.width / 2, pasteBox.y + pasteBox.height / 2);
  await pasteGrid.focus();
  await page.keyboard.press("Control+v");
  await expect(allAuthored).toHaveCount(allAuthoredCount + 2);
  await historyAction(page, "Undo");
  await expect(allAuthored).toHaveCount(allAuthoredCount);

  await authoredNote.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }),
  );
  const gridBox = await grid.boundingBox();
  const noteBox = await authoredNote.boundingBox();
  if (!gridBox || !noteBox) throw new Error("The authored note has no visible gesture bounds");
  const initialStart = await authoredNote.getAttribute("data-start-beats");
  const initialDuration = await authoredNote.getAttribute("data-duration-beats");
  const centerX = noteBox.x + noteBox.width / 2;
  const centerY = noteBox.y + noteBox.height / 2;
  const halfBeat = (gridBox.width - 34) / 8;
  const initialStyle = await authoredNote.getAttribute("style");
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX - halfBeat, centerY, { steps: 4 });
  await expect(authoredNote).not.toHaveAttribute("style", initialStyle ?? "");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(authoredNote).toHaveAttribute("data-start-beats", initialStart!);
  await expect(authoredNote).toHaveAttribute("data-duration-beats", initialDuration!);

  const moveBox = await authoredNote.boundingBox();
  if (!moveBox) throw new Error("The authored note has no visible move bounds");
  await page.mouse.move(moveBox.x + moveBox.width / 2, moveBox.y + moveBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(moveBox.x + moveBox.width / 2 - halfBeat, moveBox.y + moveBox.height / 2, {
    steps: 4,
  });
  await page.mouse.up();
  await expect(authoredNote).toHaveAttribute("data-start-beats", "3/1");
  await historyAction(page, "Undo");
  await expect(authoredNote).toHaveAttribute("data-start-beats", initialStart!);
  await historyAction(page, "Redo");
  await expect(authoredNote).toHaveAttribute("data-start-beats", "3/1");

  const resizedBox = await authoredNote.boundingBox();
  if (!resizedBox) throw new Error("The authored note has no visible resize bounds");
  await page.mouse.move(resizedBox.x + 2, resizedBox.y + resizedBox.height / 2);
  await expect
    .poll(() => authoredNote.evaluate((element) => getComputedStyle(element).cursor))
    .toBe("ew-resize");
  await page.mouse.move(resizedBox.x + resizedBox.width - 2, resizedBox.y + resizedBox.height / 2);
  await expect
    .poll(() => authoredNote.evaluate((element) => getComputedStyle(element).cursor))
    .toBe("ew-resize");
  await page.mouse.down();
  await page.mouse.move(
    resizedBox.x + resizedBox.width - 2 + halfBeat,
    resizedBox.y + resizedBox.height / 2,
    { steps: 4 },
  );
  await expect
    .poll(() => grid.evaluate((element) => getComputedStyle(element).cursor))
    .toBe("ew-resize");
  await page.mouse.up();
  await expect(authoredNote).toHaveAttribute("data-duration-beats", "1/1");
  await historyAction(page, "Undo");
  await expect(authoredNote).toHaveAttribute("data-duration-beats", initialDuration!);
  await historyAction(page, "Redo");
  await expect(authoredNote).toHaveAttribute("data-duration-beats", "1/1");

  const leftResizeBox = await authoredNote.boundingBox();
  if (!leftResizeBox) throw new Error("The authored note has no visible left resize bounds");
  await page.mouse.move(leftResizeBox.x + 2, leftResizeBox.y + leftResizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    leftResizeBox.x + 2 - halfBeat,
    leftResizeBox.y + leftResizeBox.height / 2,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect(authoredNote).toHaveAttribute("data-start-beats", "5/2");
  await expect(authoredNote).toHaveAttribute("data-duration-beats", "3/2");
  await historyAction(page, "Undo");
  await expect(authoredNote).toHaveAttribute("data-start-beats", "3/1");
  await expect(authoredNote).toHaveAttribute("data-duration-beats", "1/1");
  await historyAction(page, "Redo");
  await expect(authoredNote).toHaveAttribute("data-start-beats", "5/2");
  await expect(authoredNote).toHaveAttribute("data-duration-beats", "3/2");

  const cancelCaptureBox = await authoredNote.boundingBox();
  if (!cancelCaptureBox) throw new Error("The Piano Roll note has no lost-capture bounds");
  const cancelCaptureX = cancelCaptureBox.x + cancelCaptureBox.width / 2;
  const cancelCaptureY = cancelCaptureBox.y + cancelCaptureBox.height / 2;
  await page.mouse.move(cancelCaptureX, cancelCaptureY);
  await page.mouse.down();
  await page.mouse.move(cancelCaptureX - halfBeat, cancelCaptureY, { steps: 4 });
  await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>(".piano-roll-grid");
    grid?.dispatchEvent(
      new PointerEvent("lostpointercapture", { bubbles: true, pointerId: 1, buttons: 1 }),
    );
  });
  await page.mouse.up();
  await expect(authoredNote).toHaveAttribute("data-start-beats", "5/2");
  await expect(authoredNote).toHaveAttribute("data-duration-beats", "3/2");
  await historyAction(page, "Undo");
  await expect(authoredNote).toHaveAttribute("data-start-beats", "3/1");
  await historyAction(page, "Redo");
  await expect(authoredNote).toHaveAttribute("data-start-beats", "5/2");

  const viewCancelBox = await authoredNote.boundingBox();
  if (!viewCancelBox) throw new Error("The Piano Roll note has no view-change bounds");
  await page.mouse.move(viewCancelBox.x + viewCancelBox.width / 2, viewCancelBox.y + 18);
  await page.mouse.down();
  await page.mouse.move(
    viewCancelBox.x + viewCancelBox.width / 2 - halfBeat,
    viewCancelBox.y + 18,
    {
      steps: 4,
    },
  );
  await page
    .getByTestId("progression-view-btn-staff")
    .evaluate((button) => (button as HTMLButtonElement).click());
  await page.mouse.up();
  await page
    .getByTestId("progression-view-btn-piano-roll")
    .evaluate((button) => (button as HTMLButtonElement).click());
  await authoredNote.click();
  await expect(authoredNote).toHaveAttribute("data-start-beats", "5/2");

  const staleBaselinePitch = Number(await authoredNote.getAttribute("data-pitch-midi"));
  const staleGestureBox = await authoredNote.boundingBox();
  if (!staleGestureBox) throw new Error("The Piano Roll note has no stale-project bounds");
  await authoredNote.focus();
  await page.mouse.move(
    staleGestureBox.x + staleGestureBox.width / 2,
    staleGestureBox.y + staleGestureBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    staleGestureBox.x + staleGestureBox.width / 2 - halfBeat,
    staleGestureBox.y + staleGestureBox.height / 2,
    { steps: 4 },
  );
  await authoredNote.focus();
  await page.keyboard.press("e");
  const staleInspector = page.getByRole("region", { name: "Piano Roll Inspector" });
  await expect(staleInspector).toBeVisible();
  const inspectorPitch = page.getByLabel("Inspector pitch MIDI");
  await inspectorPitch.evaluate((input) => input.focus());
  await page.keyboard.press("Control+A");
  await page.keyboard.type(String(staleBaselinePitch + 1));
  await inspectorPitch.press("Enter");
  await page.mouse.up();
  await expect(authoredNote).toHaveAttribute("data-pitch-midi", String(staleBaselinePitch + 1));
  await expect(authoredNote).toHaveAttribute("data-start-beats", "5/2");
  await historyAction(page, "Undo");
  await expect(authoredNote).toHaveAttribute("data-pitch-midi", String(staleBaselinePitch));
  await expect(authoredNote).toHaveAttribute("data-start-beats", "5/2");

  await page.setViewportSize({ width: 1280, height: 720 });
  await setLayoutMeasuresPerSystem(page, 2);
  const transferInspector = page.getByRole("region", { name: "Piano Roll Inspector" });
  if (await transferInspector.count()) {
    await transferInspector.getByLabel("Inspector pitch MIDI").focus();
    await page.keyboard.press("Escape");
    await expect(transferInspector).toHaveCount(0);
  }
  await authoredNote.evaluate((element) =>
    element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }),
  );
  const initialTransferNoteBox = await authoredNote.boundingBox();
  const sourceGridBox = await grid.boundingBox();
  if (!initialTransferNoteBox || !sourceGridBox)
    throw new Error("The Piano Roll note has no visible cross-system bounds");
  const pitchRowFraction =
    (initialTransferNoteBox.y + initialTransferNoteBox.height / 2 - sourceGridBox.y) /
    sourceGridBox.height;
  const destinationGrid = await page.evaluate(
    ({ destinationStart, sourceStepId }) => {
      const requireFiniteNumber = (value: number | undefined, label: string) => {
        if (value === undefined || !Number.isFinite(value)) {
          throw new Error(`Expected a finite ${label}.`);
        }
        return value;
      };
      const [startN, startD] = destinationStart.split("/").map(Number);
      const startNumerator = requireFiniteNumber(startN, "beat numerator");
      const startDenominator = requireFiniteNumber(startD, "beat denominator");
      if (startDenominator === 0) throw new Error("Expected a non-zero beat denominator.");
      const start = startNumerator / startDenominator;
      const chord = document.querySelector<HTMLElement>(
        `.piano-roll-chord[data-source-step-id='${sourceStepId}']`,
      );
      const meterText = chord
        ?.closest(".piano-roll-measure")
        ?.querySelector("header span")?.textContent;
      const [numerator, denominator] = (meterText ?? "4/4").split("/").map(Number);
      const beatsPerBarNumerator = requireFiniteNumber(numerator, "meter numerator");
      const beatsPerBarDenominator = requireFiniteNumber(denominator, "meter denominator");
      if (beatsPerBarDenominator === 0) throw new Error("Expected a non-zero meter denominator.");
      const beatsPerBar = (beatsPerBarNumerator * 4) / beatsPerBarDenominator;
      const targetBeat = start + 1.75;
      const measureIndex = Math.floor(targetBeat / beatsPerBar);
      const fraction = (targetBeat - measureIndex * beatsPerBar) / beatsPerBar;
      return { measureIndex, fraction };
    },
    { destinationStart, sourceStepId: secondStepId },
  );
  const secondSystemGrid = page.locator(
    `.piano-roll-measure[data-measure-index="${destinationGrid.measureIndex}"] .piano-roll-grid`,
  );
  await secondSystemGrid.scrollIntoViewIfNeeded();
  await expect(secondSystemGrid).toBeInViewport();
  const targetGridBox = await secondSystemGrid.boundingBox();
  const transferNoteBox = await authoredNote.boundingBox();
  if (!targetGridBox) throw new Error("The destination Piano Roll system did not scroll into view");
  if (!transferNoteBox) throw new Error("The source Piano Roll note is not visible");
  const transferX = transferNoteBox.x + transferNoteBox.width / 2;
  const transferY = transferNoteBox.y + transferNoteBox.height / 2;
  const targetX = targetGridBox.x + 34 + (targetGridBox.width - 34) * destinationGrid.fraction;
  const targetY = targetGridBox.y + pitchRowFraction * targetGridBox.height;
  await page.mouse.move(transferX, transferY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 5 });
  await page.mouse.up();
  await expect(authoredNote).toHaveAttribute("data-source-step-id", secondStepId);
  await expect(authoredNote).not.toHaveAttribute("data-start-beats", "5/2");
  await expect(authoredNote).toHaveAttribute("data-duration-beats", "3/2");
  await authoredNote.press("e");
  await expect(page.getByRole("region", { name: "Piano Roll Inspector" })).toBeVisible();
  const projectDownload = page.waitForEvent("download");
  await page.getByTestId("export-menu-toggle").click();
  await page.getByRole("menu", { name: "Export menu" }).getByTestId("project-export-btn").click();
  const exportedProjectPath = await (await projectDownload).path();
  if (!exportedProjectPath) throw new Error("Could not read exported project after Step transfer");
  const exportedProject = JSON.parse(await readFile(exportedProjectPath, "utf8")) as {
    progression: {
      steps: Array<{
        id: string;
        kind: string;
        melody?: { mode: string; phrase?: { notes?: Array<{ id: string }> } };
      }>;
    };
  };
  const exportedSourceStep = exportedProject.progression.steps.find((step) => step.id === stepId);
  const exportedDestinationStep = exportedProject.progression.steps.find(
    (step) => step.id === secondStepId,
  );
  expect(exportedSourceStep?.melody?.phrase?.notes?.some((note) => note.id === noteId)).toBe(false);
  expect(exportedDestinationStep?.melody?.phrase?.notes?.some((note) => note.id === noteId)).toBe(
    true,
  );
  const transferredPitch = await authoredNote.getAttribute("data-pitch-midi");
  const transferredStart = await authoredNote.getAttribute("data-start-beats");
  await historyAction(page, "Undo");
  await expect(authoredNote).toHaveAttribute("data-source-step-id", stepId);
  await expect(authoredNote).toHaveAttribute("data-start-beats", "5/2");
  await expect(authoredNote).toHaveAttribute("data-duration-beats", "3/2");
  await historyAction(page, "Redo");
  await expect(authoredNote).toHaveAttribute("data-source-step-id", secondStepId);
  await expect(authoredNote).toHaveAttribute("data-start-beats", transferredStart!);
  await expect(authoredNote).toHaveAttribute("data-pitch-midi", transferredPitch!);

  await authoredNote.focus();
  await page.keyboard.press("Delete");
  await expect(authoredNote).toHaveCount(0);
});

test("Piano Roll note audition playhead crosses system boundaries and clears at its effective end", async ({
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
        .getByTestId(`chord-card-${chord}`)
        .locator(".chord-main")
        .click({ modifiers: ["Control"] });
    }
  }
  await page.getByTestId("progression-view-btn-staff").click();
  const firstStep = page.locator("[data-progression-step-select]").first();
  const firstStepId = await firstStep.getAttribute("data-step-id");
  if (!firstStepId) throw new Error("First Step has no stable ID");
  await firstStep.click({ button: "right" });
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
  const authored = page.locator(
    `button.piano-roll-note[data-source-step-id='${firstStepId}'][data-generated='true']`,
  );
  await expect(authored.first()).toBeVisible();
  await authored.first().click({ force: true });
  // The chord Step remains selected in the inspector, so open the note editor
  // through the note's supported keyboard action instead of the global header.
  await authored.first().press("e");
  const inspector = page.getByRole("region", { name: "Piano Roll Inspector" });
  const durationNumerator = inspector.getByLabel("Inspector duration numerator");
  await durationNumerator.fill("10");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(durationNumerator).toBeFocused();
  await expect(durationNumerator).toHaveValue("10");
  await durationNumerator.press("Enter");
  const materialized = page.locator(
    `button.piano-roll-note[data-source-step-id='${firstStepId}'][data-generated='false']`,
  );
  await expect(materialized.first()).toHaveAttribute("data-duration-beats", "5/1");
  await page.keyboard.press("Escape");
  await expect(inspector).toHaveCount(0);
  const undoWasEnabled = await undoIsEnabled(page);
  await materialized.first().click();
  const notePlayhead = page.locator(".piano-roll-playhead[data-audition-end-beat='5']");
  await expect(notePlayhead).toBeVisible();
  await expect(
    page.locator('[data-testid="piano-roll-measure"][data-measure-index="1"] .piano-roll-playhead'),
  ).toBeVisible({ timeout: 3000 });
  await page.getByTestId("piano-roll-measure").nth(1).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/piano-roll-note-audition-cross-system.png" });
  expect(await undoIsEnabled(page)).toBe(undoWasEnabled);
  await expect(notePlayhead).toHaveCount(0, { timeout: 6000 });
  await materialized.first().focus();
  await page.keyboard.press("Enter");
  await expect(notePlayhead).toBeVisible();
  expect(await undoIsEnabled(page)).toBe(undoWasEnabled);
  await expect(notePlayhead).toBeHidden({ timeout: 6000 });
});

test("vertical Piano Roll drags preserve exact off-grid onset at every body grab position", async ({
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
        .getByTestId(`chord-card-${chord}`)
        .locator(".chord-main")
        .click({ modifiers: ["Control"] });
    }
  }
  await page.getByTestId("progression-view-btn-staff").click();
  const first = page.locator("[data-progression-step-select]").first();
  const stepId = await first.getAttribute("data-step-id");
  if (!stepId) throw new Error("First Step has no stable ID");
  await first.click({ button: "right" });
  await page
    .getByRole("menu", { name: /Melody actions/ })
    .getByRole("menuitem", { name: "Create Melody…" })
    .click();
  await page
    .getByRole("dialog", { name: "Create Melody" })
    .getByRole("button", { name: "Apply Melody" })
    .click();
  await page.getByTestId("progression-view-btn-piano-roll").click();

  const generated = page
    .locator(`button.piano-roll-note[data-source-step-id="${stepId}"][data-generated="true"]`)
    .first();
  const eventKey = await generated.getAttribute("data-piano-roll-event-key");
  if (!eventKey) throw new Error("Generated note has no event identity");
  await generated.click();
  const inspector = page.getByRole("region", { name: "Piano Roll Inspector" });
  await expect(inspector).toHaveCount(0);
  await generated.press("e");
  await expect(inspector).toBeVisible();
  await inspector.getByLabel("Inspector onset denominator").fill("3");
  await inspector.getByLabel("Inspector onset denominator").press("Enter");
  await inspector.getByLabel("Inspector onset numerator").fill("1");
  await inspector.getByLabel("Inspector onset numerator").press("Enter");
  const note = page.locator(
    `button.piano-roll-note[data-source-step-id="${stepId}"][data-piano-roll-event-key="${eventKey}"]`,
  );
  await expect(note).toHaveAttribute("data-generated", "false");
  await expect(note).toHaveAttribute("data-start-beats", "1/3");
  const originalDuration = await note.getAttribute("data-duration-beats");
  const originalPitch = Number(await note.getAttribute("data-pitch-midi"));
  await inspector.getByLabel("Inspector pitch MIDI").fill(String(originalPitch + 1));
  await inspector.getByLabel("Inspector pitch MIDI").press("Escape");
  await expect(inspector).toHaveCount(0);
  await expect(note).toHaveAttribute("data-pitch-midi", String(originalPitch));
  await expect(note).toBeFocused();
  await page.getByLabel("Snap resolution").selectOption("1/16");

  for (const grab of ["left", "center", "right"] as const) {
    const box = await note.boundingBox();
    if (!box) throw new Error("Piano Roll note has no gesture bounds");
    const grabX =
      grab === "left"
        ? box.x + box.width * 0.35
        : grab === "right"
          ? box.x + box.width * 0.65
          : box.x + box.width / 2;
    const grabY = box.y + box.height / 2;
    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    // Simulate an initially misleading horizontal pointer sample before the
    // clear vertical trajectory wins; the note onset must remain unchanged.
    await page.mouse.move(grabX + 14, grabY - 2);
    await page.mouse.move(grabX + 14, grabY - box.height * 3);
    await expect(
      note.locator("xpath=ancestor::div[contains(@class,'piano-roll-grid')]"),
    ).toHaveClass(/is-note-moving/);
    await page.mouse.up();
    await expect(note).not.toHaveAttribute("data-pitch-midi", String(originalPitch));
    await expect(note).toHaveAttribute("data-start-beats", "1/3");
    await expect(note).toHaveAttribute("data-duration-beats", originalDuration!);
  }
});

test("Piano Roll keyboard creates at the active cell and edits pitch without auditioning", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.addInitScript(() => window.localStorage.clear());
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
  await page.getByTestId("piano-roll-chord").first().click();
  await page.getByTestId("progression-view-btn-piano-roll").click();
  const grid = page.locator(".piano-roll-grid").first();
  await grid.focus();
  await expect(page.getByTestId("piano-roll-keyboard-caret")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  await expect(grid).toHaveAttribute("data-keyboard-focus-onset", "1/2");
  await expect(grid).toHaveAttribute("data-keyboard-focus-pitch", "61");
  await page.keyboard.press("Enter");

  const authored = page.locator("button.piano-roll-note[data-generated='false']").first();
  await expect(authored).toBeFocused();
  await expect(authored).toHaveAttribute("data-pitch-midi", "61");
  await expect(authored).toHaveAttribute("data-start-beats", "1/2");
  await expect(authored).toHaveAttribute("data-duration-beats", "1/2");
  await expect(authored).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".piano-roll-playhead[data-audition-end-beat]")).toHaveCount(0);

  await page.keyboard.press("ArrowUp");
  await expect(authored).toHaveAttribute("data-pitch-midi", "62");
  await expect(authored).toHaveAttribute("data-start-beats", "1/2");
  await expect(authored).toHaveAttribute("data-duration-beats", "1/2");
  await expect(page.locator(".piano-roll-playhead[data-audition-end-beat]")).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await expect(authored).toHaveAttribute("data-pitch-midi", "61");
  await page.keyboard.press("Control+z");
  await expect(authored).toHaveAttribute("data-pitch-midi", "62");
  await page.keyboard.press("Control+z");
  await expect(authored).toHaveAttribute("data-pitch-midi", "61");
  await page.keyboard.press("Control+Shift+z");
  await expect(authored).toHaveAttribute("data-pitch-midi", "62");
  await page.keyboard.press("Control+Shift+z");
  await expect(authored).toHaveAttribute("data-pitch-midi", "61");
  await expect(page.locator(".piano-roll-playhead[data-audition-end-beat]")).toHaveCount(0);

  const keyboardPortable = await exportPortableProject(page);
  const keyboardStepId = await authored.getAttribute("data-source-step-id");
  const keyboardEventKey = await authored.getAttribute("data-piano-roll-event-key");
  if (!keyboardStepId || !keyboardEventKey)
    throw new Error("Keyboard-created note has no portable owner or identity");
  const keyboardStoredStep = portableStep(keyboardPortable, keyboardStepId);
  const keyboardStoredNote = keyboardStoredStep.melody?.phrase?.notes.find(
    (note) => note.id === keyboardEventKey,
  );
  expect(keyboardStoredStep.melody?.mode).toBe("authored");
  expect(keyboardStoredNote).toMatchObject({
    pitch: { midiNumber: 61 },
    onset: { numerator: 1, denominator: 2 },
    duration: { numerator: 1, denominator: 2 },
  });

  await authored.focus();
  await expect(authored).toBeFocused();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(authored).toHaveAttribute("data-start-beats", "1/1");
  await page.keyboard.press("Control+z");
  await expect(authored).toHaveAttribute("data-start-beats", "1/2");

  await page.keyboard.press("Delete");
  await expect(page.locator("button.piano-roll-note[data-generated='false']")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.locator("button.piano-roll-note[data-generated='false']")).toHaveCount(1);
});

for (const gridMode of ["Degrees", "Chromatic"] as const) {
  test(`Auto range ${gridMode} edge drags preserve the exact row and portable note state`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 1600 });
    await page.addInitScript(() => window.localStorage.clear());
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
    await page.getByTestId("progression-view-btn-staff").click();
    const first = page.locator("[data-progression-step-select]").first();
    await first.click({ button: "right" });
    await page
      .getByRole("menu", { name: /Melody actions/ })
      .getByRole("menuitem", { name: "Create Melody…" })
      .click();
    await page
      .getByRole("dialog", { name: "Create Melody" })
      .getByRole("button", { name: "Apply Melody" })
      .click();
    await page.getByTestId("progression-view-btn-piano-roll").click();
    await page.getByLabel("Vertical range").selectOption("0");
    const toolbar = page.getByTestId("piano-roll-toolbar");
    await toolbar.getByRole("button", { name: gridMode }).click();

    const allNotes = page.locator("button.piano-roll-note[data-generated='true']");
    await expect(allNotes).not.toHaveCount(0);
    const noteIdentities = await allNotes.evaluateAll((buttons) =>
      buttons.map((button) => ({
        pitch: Number((button as HTMLButtonElement).dataset.pitchMidi),
        eventKey: (button as HTMLButtonElement).dataset.pianoRollEventKey,
        sourceStepId: (button as HTMLButtonElement).dataset.sourceStepId,
      })),
    );
    const targetNotes = [
      noteIdentities.reduce((best, note) => (note.pitch > best.pitch ? note : best)),
      noteIdentities.reduce((best, note) => (note.pitch < best.pitch ? note : best)),
    ];
    const portableAtStart = await exportPortableProject(page);
    const decodedProjectAtStart = decodePortableProject(JSON.stringify(portableAtStart));
    const effectiveAtStart = createEffectiveMelodyTimeline(decodedProjectAtStart);
    const portableSteps = new Map(
      portableAtStart.progression.steps.map((step) => [step.id, step] as const),
    );
    for (const [edge, target] of [
      ["upper", targetNotes[0]!],
      ["lower", targetNotes[1]!],
    ] as const) {
      if (!target.eventKey || !target.sourceStepId)
        throw new Error("The range test note has no stable owner identity");
      const note = page
        .locator(
          `button.piano-roll-note[data-source-step-id='${target.sourceStepId}'][data-piano-roll-event-key='${target.eventKey}']`,
        )
        .first();
      await note.evaluate((element) =>
        element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }),
      );
      const stableNote = note;
      const grid = stableNote.locator("xpath=ancestor::div[contains(@class,'piano-roll-grid')]");
      const originalPitch = Number(await stableNote.getAttribute("data-pitch-midi"));
      const originalStart = await stableNote.getAttribute("data-start-beats");
      const originalDuration = await stableNote.getAttribute("data-duration-beats");
      const originalMin = Number(await grid.getAttribute("data-min-pitch"));
      const originalMax = Number(await grid.getAttribute("data-max-pitch"));
      const ownerStepId = target.sourceStepId;
      if (!ownerStepId) throw new Error("Auto-range note is missing its owner Step");
      const beforeStep = portableSteps.get(ownerStepId);
      if (!beforeStep)
        throw new Error("Auto-range note owner is missing from the portable Project");
      const beforeRecipe = portableRecipe(beforeStep);
      const effectiveNoteAtStart = effectiveAtStart.find(
        (candidate) =>
          candidate.sourceStepId === ownerStepId && candidate.eventKey === target.eventKey,
      );
      if (!effectiveNoteAtStart)
        throw new Error("Auto-range note is missing from the decoded effective timeline");
      const ownerStepIndex = decodedProjectAtStart.progression.steps.findIndex(
        (step) => step.id === ownerStepId,
      );
      if (ownerStepIndex < 0)
        throw new Error("Auto-range owner Step is missing from the decoded Project");
      const ownerStart = decodedProjectAtStart.progression.steps
        .slice(0, ownerStepIndex)
        .reduce((start, step) => addRational(start, step.duration.beats), rational(0));
      const expectedStoredOnset = subtractRational(effectiveNoteAtStart.startBeats, ownerStart);
      const expectedStoredDuration = effectiveNoteAtStart.durationBeats;
      expect(effectiveNoteAtStart.pitch.midiNumber).toBe(originalPitch);
      expect(target.eventKey).toBe(effectiveNoteAtStart.eventKey);
      const gridBox = await grid.boundingBox();
      const noteBox = await stableNote.boundingBox();
      if (!gridBox || !noteBox) throw new Error("Auto-range edge note has no visible bounds");
      const units = Number(await grid.getAttribute("data-pitch-unit-count"));
      const unitHeight = gridBox.height / units;
      const dragY =
        edge === "upper" ? gridBox.y - unitHeight * 4 : gridBox.y + gridBox.height + unitHeight * 4;
      const x = noteBox.x + noteBox.width / 2;
      const y = noteBox.y + noteBox.height / 2;
      const undoBefore = await undoIsEnabled(page);

      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, dragY, { steps: 8 });
      if (edge === "upper")
        await expect(grid).toHaveAttribute("data-max-pitch", String(originalMax + 12));
      else await expect(grid).toHaveAttribute("data-min-pitch", String(originalMin - 12));
      await expect(stableNote).not.toHaveAttribute("data-pitch-midi", String(originalPitch));
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect(stableNote).toHaveAttribute("data-pitch-midi", String(originalPitch));
      await expect(stableNote).toHaveAttribute("data-start-beats", originalStart!);
      await expect(stableNote).toHaveAttribute("data-duration-beats", originalDuration!);
      await expect(grid).toHaveAttribute("data-min-pitch", String(originalMin));
      await expect(grid).toHaveAttribute("data-max-pitch", String(originalMax));
      expect(await undoIsEnabled(page)).toBe(undoBefore);
      const portableAfterCancel = await exportPortableProject(page);
      expect(portableStep(portableAfterCancel, ownerStepId)).toEqual(beforeStep);

      const resetGridBox = await grid.boundingBox();
      const resetNoteBox = await stableNote.boundingBox();
      if (!resetGridBox || !resetNoteBox)
        throw new Error("Cancelled gesture lost its source bounds");
      const resetUnits = Number(await grid.getAttribute("data-pitch-unit-count"));
      const resetUnitHeight = resetGridBox.height / resetUnits;
      const commitY =
        edge === "upper"
          ? resetGridBox.y - resetUnitHeight * 4
          : resetGridBox.y + resetGridBox.height + resetUnitHeight * 4;
      const expectedPitchAtPointer = expectedPitchFromFrozenC4Geometry(
        { min: originalMin, max: originalMax },
        gridMode,
        resetGridBox.y,
        resetGridBox.height,
        resetUnits,
        commitY,
      );
      await page.mouse.move(
        resetNoteBox.x + resetNoteBox.width / 2,
        resetNoteBox.y + resetNoteBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(resetNoteBox.x + resetNoteBox.width / 2, commitY, { steps: 8 });
      expect(expectedPitchAtPointer).toBeGreaterThan(0);
      if (edge === "upper") expect(expectedPitchAtPointer).toBeGreaterThan(originalMax);
      else expect(expectedPitchAtPointer).toBeLessThan(originalMin);
      await expect(stableNote).toHaveAttribute("data-pitch-midi", String(expectedPitchAtPointer));
      const previewStart = await stableNote.getAttribute("data-start-beats");
      const previewDuration = await stableNote.getAttribute("data-duration-beats");
      await page.mouse.move(resetNoteBox.x + resetNoteBox.width / 2 + 1, commitY);
      await page.mouse.move(resetNoteBox.x + resetNoteBox.width / 2, commitY);
      await expect(stableNote).toHaveAttribute("data-pitch-midi", String(expectedPitchAtPointer));
      await expect(stableNote).toHaveAttribute("data-start-beats", previewStart!);
      await expect(stableNote).toHaveAttribute("data-duration-beats", previewDuration!);
      await page.mouse.up();
      const committedPitch = Number(await stableNote.getAttribute("data-pitch-midi"));
      expect(committedPitch).toBe(expectedPitchAtPointer);
      await expect(stableNote).toHaveAttribute("data-start-beats", originalStart!);
      await expect(stableNote).toHaveAttribute("data-duration-beats", originalDuration!);
      const portableAfterCommit = await exportPortableProject(page);
      const committedStep = portableStep(portableAfterCommit, ownerStepId);
      const committedNote = committedStep.melody?.phrase?.notes.find(
        (note) => note.id === target.eventKey,
      );
      expect(committedStep.id).toBe(ownerStepId);
      expect(committedStep.melody?.mode).toBe("authored");
      expect(portableRecipe(committedStep)).toEqual(beforeRecipe);
      expect(committedNote).toMatchObject({
        pitch: { midiNumber: committedPitch },
        onset: expectedStoredOnset,
        duration: expectedStoredDuration,
      });
      portableSteps.set(ownerStepId, committedStep);
      await page.keyboard.press("Control+z");
      await expect(stableNote).toHaveAttribute("data-pitch-midi", String(originalPitch));
      await expect(stableNote).toHaveAttribute("data-start-beats", originalStart!);
      await expect(stableNote).toHaveAttribute("data-duration-beats", originalDuration!);
      expect(await undoIsEnabled(page)).toBe(true);
      const portableAfterUndo = await exportPortableProject(page);
      const undoneStep = portableStep(portableAfterUndo, ownerStepId);
      expect(undoneStep.id).toBe(ownerStepId);
      expect(portableRecipe(undoneStep)).toEqual(beforeRecipe);
      expect(undoneStep).toEqual(beforeStep);
      await page.keyboard.press("Control+Shift+z");
      await expect(stableNote).toHaveAttribute("data-pitch-midi", String(committedPitch));
      expect(await undoIsEnabled(page)).toBe(true);
      const portableAfterRedo = await exportPortableProject(page);
      const redoneStep = portableStep(portableAfterRedo, ownerStepId);
      expect(redoneStep.id).toBe(ownerStepId);
      expect(portableRecipe(redoneStep)).toEqual(beforeRecipe);
      expect(redoneStep).toEqual(committedStep);
      expect(await page.locator(".piano-roll-playhead[data-audition-end-beat]").count()).toBe(0);
    }
  });
}
