import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

interface PortableFixtureStep {
  kind: string;
  melody?: { mode: string; phrase?: { notes: { id: string }[] } };
  authoredMelody?: { notes: { id: string }[] };
}
interface PortableFixtureProject {
  name: string;
  progression: { steps: PortableFixtureStep[] };
}

const evidenceRoot =
  "C:/Users/pavel/.codex/visualizations/2026/09/30/01a0f429-fbf3-7d12-b9b6-eeb5b234239d/piano-roll-batch2";

const settleLayout = async (page: import("@playwright/test").Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

const scrollGridIntoView = async (page: import("@playwright/test").Page) => {
  const grid = page.locator(".piano-roll-grid").first();
  await grid.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await settleLayout(page);
  await expect(grid).toBeInViewport();
};

test("Piano Roll display uses the canonical timeline and stays inside its systems", async ({
  page,
}) => {
  test.setTimeout(150_000);
  mkdirSync(evidenceRoot, { recursive: true });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 15_000,
  });
  for (const chord of ["I", "V", "vi", "IV"]) {
    await page
      .getByTestId(`chord-card-${chord}`)
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
  }
  await expect(page.getByTestId("progression-step")).toHaveCount(4);
  await page.locator("[data-progression-step-select]").first().click();
  await page.getByTestId("quick-edit-duration").selectOption("2/1");
  const sectionName = page.getByLabel("New section name at Step 1");
  await sectionName.fill("Opening verse with a deliberately long section title");
  await sectionName.press("Enter");
  await sectionName.fill("Second marker in this measure");
  await sectionName.press("Enter");
  await page.locator("[data-progression-step-select]").nth(1).click();
  await page.getByTestId("quick-edit-duration").selectOption("2/1");
  const secondSection = page.getByLabel("New section name at Step 2");
  await secondSection.fill("Chorus");
  await secondSection.press("Enter");
  await page.locator("[data-progression-step-select]").first().click();
  const firstStep = page.getByTestId("progression-step").first();
  await firstStep.locator("[data-progression-step-select]").click({ button: "right" });
  await page
    .getByRole("menu", { name: /Melody actions/ })
    .getByRole("menuitem", { name: "Create Melody…" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Create Melody" });
  await dialog.getByRole("button", { name: "Authored notes" }).click();
  await dialog.getByLabel("Authored pitch MIDI").fill("67");
  await dialog.getByLabel("Authored onset numerator").fill("1");
  await dialog.getByLabel("Authored onset denominator").fill("2");
  await dialog.getByLabel("Authored duration numerator").fill("6");
  await dialog.getByLabel("Authored duration denominator").fill("1");
  await dialog.getByRole("button", { name: "Add note" }).click();
  for (const [pitch, onset, denominator] of [
    [71, 1, 1],
    [74, 2, 1],
    [71, 3, 1],
    [72, 1, 3],
  ] as const) {
    await dialog.getByLabel("Authored pitch MIDI").fill(String(pitch));
    await dialog.getByLabel("Authored onset numerator").fill(String(onset));
    await dialog.getByLabel("Authored onset denominator").fill(String(denominator));
    await dialog.getByLabel("Authored duration numerator").fill("1");
    await dialog.getByLabel("Authored duration denominator").fill(String(denominator));
    await dialog.getByRole("button", { name: "Add note" }).click();
  }
  await dialog.getByRole("button", { name: "Apply Melody" }).click();
  await page.locator("[data-progression-step-select]").nth(1).click({ button: "right" });
  await page
    .getByRole("menu", { name: /Melody actions/ })
    .getByRole("menuitem", { name: "Create Melody…" })
    .click();
  const generatedDialog = page.getByRole("dialog", { name: "Create Melody" });
  await generatedDialog.getByRole("button", { name: "Apply Melody" }).click();
  for (const [stepIndex, pitch] of [
    [2, 76],
    [3, 74],
  ] as const) {
    await page.locator("[data-progression-step-select]").nth(stepIndex).click({ button: "right" });
    await page
      .getByRole("menu", { name: /Melody actions/ })
      .getByRole("menuitem", { name: "Create Melody…" })
      .click();
    const chordDialog = page.getByRole("dialog", { name: "Create Melody" });
    await chordDialog.getByRole("button", { name: "Authored notes" }).click();
    await chordDialog.getByLabel("Authored pitch MIDI").fill(String(pitch));
    await chordDialog.getByLabel("Authored onset numerator").fill("0");
    await chordDialog.getByLabel("Authored onset denominator").fill("1");
    await chordDialog.getByLabel("Authored duration numerator").fill("1");
    await chordDialog.getByLabel("Authored duration denominator").fill("1");
    await chordDialog.getByRole("button", { name: "Add note" }).click();
    await chordDialog.getByRole("button", { name: "Apply Melody" }).click();
  }

  await page.getByTestId("progression-view-btn-piano-roll").click();
  await expect(page.getByTestId("progression-view-btn-piano-roll")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("piano-roll-toolbar")).toBeVisible();
  await expect(page.locator(".score-system-header").first()).toContainText("System 1");
  await expect(page.getByTestId("piano-roll-measure")).toHaveCount(3);
  const firstMeasureNotes = page
    .getByTestId("piano-roll-measure")
    .first()
    .getByTestId("piano-roll-note");
  expect(await firstMeasureNotes.count()).toBeGreaterThanOrEqual(5);
  const tripletNote = page.locator('button.piano-roll-note[data-start-beats="1/3"]');
  await expect(tripletNote.first()).toBeVisible();
  const longNote = page
    .getByTestId("piano-roll-note")
    .filter({ has: page.locator("span") })
    .filter({ hasText: "G4" });
  await expect(longNote.first()).toHaveAttribute("data-start-beats", "1/2");
  await expect(longNote.first()).toHaveAttribute("data-duration-beats", "6/1");
  await expect(page.locator('button.piano-roll-note[data-generated="true"]').first()).toBeVisible();
  for (const stepId of await page
    .locator("[data-progression-step-select]")
    .evaluateAll((els) => els.slice(0, 4).map((el) => el.getAttribute("data-step-id")))) {
    await expect(
      page.locator(`button.piano-roll-note[data-source-step-id="${stepId}"]`).first(),
    ).toBeVisible();
  }
  await expect(page.locator("svg.piano-roll-note.is-generated").first()).toBeVisible();
  const eventKey = await longNote.first().getAttribute("data-piano-roll-event-key");
  const continuation = page
    .getByTestId("piano-roll-measure")
    .nth(1)
    .locator(`button.piano-roll-note[data-piano-roll-event-key="${eventKey}"]`);
  await expect(continuation).toHaveClass(/is-continuation/);
  await expect(continuation).toHaveAttribute("data-fragment-start-beats", "4/1");
  await expect(continuation).toHaveAttribute("data-fragment-duration-beats", "5/2");
  await expect(page.getByTestId("piano-roll-chord")).toHaveCount(4);
  await expect(page.getByTestId("piano-roll-chord").first()).toBeVisible();
  await expect(page.getByTestId("piano-roll-chord").first()).not.toBeEmpty();
  const chordHierarchy = page
    .getByTestId("piano-roll-chord")
    .first()
    .getByTestId("progression-chord-label");
  await expect(chordHierarchy).toHaveAttribute("data-label-mode", "function-first");
  await expect(chordHierarchy.locator(".progression-chord-label-primary")).toHaveText("I");
  await expect(chordHierarchy.locator(".progression-chord-label-secondary")).toHaveText("C");
  await page.getByRole("button", { name: "Chord first", exact: true }).click();
  await expect(chordHierarchy).toHaveAttribute("data-label-mode", "chord-first");
  await expect(chordHierarchy.locator(".progression-chord-label-primary")).toHaveText("C");
  await expect(chordHierarchy.locator(".progression-chord-label-secondary")).toHaveText("I");
  await page.getByRole("button", { name: "Inline", exact: true }).click();
  await expect(chordHierarchy).toHaveAttribute("data-label-mode", "inline");
  await expect(chordHierarchy.locator(".progression-chord-label-primary")).toHaveText("C");
  await expect(chordHierarchy.locator(".progression-chord-label-secondary")).toHaveText("(I)");
  await page.getByRole("button", { name: "Function first", exact: true }).click();
  await expect(page.locator(".piano-roll-svg").first()).toBeVisible();
  await expect(
    page.locator(".piano-roll-svg").first().locator(".piano-roll-snap-line"),
  ).toHaveCount(9);
  await expect(
    page
      .locator(".piano-roll-system-pitch-scale.is-degrees .piano-roll-system-pitch-row > span")
      .first(),
  ).toBeVisible();
  await expect(page.locator(".piano-roll-system-pitch-gutter")).toHaveCount(
    await page.locator(".score-system-pitch-layout").count(),
  );
  const sectionGeometry = await page
    .locator(".piano-roll-section-lane")
    .first()
    .evaluate((lane) => {
      const laneRect = lane.getBoundingClientRect();
      const markers = Array.from(
        lane.querySelectorAll<HTMLElement>(".piano-roll-section-boundary"),
      );
      return {
        gutter: 0,
        markers: markers.map((marker) => marker.getBoundingClientRect().left - laneRect.left),
        boundaryWidths: markers.map((marker) => marker.getBoundingClientRect().width),
        labelWidths: markers.map(
          (marker) => marker.querySelector("span")!.getBoundingClientRect().width,
        ),
        truncatedLabels: markers.filter((marker) => {
          const label = marker.querySelector<HTMLElement>("span")!;
          return label.scrollWidth > label.clientWidth;
        }).length,
      };
    });
  expect(sectionGeometry.markers.length).toBeGreaterThanOrEqual(2);
  expect(sectionGeometry.markers.every((left) => left >= -1)).toBe(true);
  expect(
    sectionGeometry.labelWidths.every((width) => width > 30 && width <= 180),
    JSON.stringify(sectionGeometry),
  ).toBe(true);
  expect(sectionGeometry.truncatedLabels).toBeGreaterThan(0);
  const rowGeometry = await page
    .locator(".piano-roll-system-pitch-row")
    .first()
    .evaluate((row) => {
      const label = row.querySelector<HTMLElement>("span")!;
      return {
        rowHeight: row.getBoundingClientRect().height,
        labelHeight: label.getBoundingClientRect().height,
      };
    });
  expect(rowGeometry.rowHeight).toBeGreaterThanOrEqual(16);
  expect(rowGeometry.labelHeight).toBeGreaterThan(0);
  expect(rowGeometry.labelHeight).toBeLessThanOrEqual(rowGeometry.rowHeight);

  const noteGeometry = await page
    .getByTestId("piano-roll-note")
    .first()
    .evaluate((note) => {
      const grid = note.closest(".piano-roll-grid")!.getBoundingClientRect();
      const rect = note.getBoundingClientRect();
      return { left: rect.left - grid.left, right: rect.right - grid.left, width: grid.width };
    });
  expect(noteGeometry.left).toBeGreaterThanOrEqual(0);
  expect(noteGeometry.right).toBeLessThanOrEqual(noteGeometry.width + 1);
  const alignedBoundary = await page
    .getByTestId("piano-roll-note-layer")
    .first()
    .evaluate((layer) => {
      const firstHarmony = layer
        .closest(".piano-roll-measure")!
        .querySelector(".piano-roll-chord")!;
      return Math.abs(
        layer.getBoundingClientRect().left - firstHarmony.getBoundingClientRect().left,
      );
    });
  expect(alignedBoundary).toBeLessThanOrEqual(1);
  await page.getByTestId("piano-roll-note").first().click();
  await expect(page.getByTestId("piano-roll-note").first()).toHaveAttribute("aria-pressed", "true");
  const selectedIdentity = await page
    .locator(".piano-roll-note[aria-pressed='true']")
    .evaluateAll(
      (notes) =>
        new Set(
          notes.map(
            (note) =>
              `${note.getAttribute("data-source-step-id")}:${note.getAttribute("data-piano-roll-event-key")}`,
          ),
        ).size,
    );
  expect(selectedIdentity).toBe(1);
  await page.getByTestId("piano-roll-note").nth(1).click();
  await expect(page.getByTestId("piano-roll-note").nth(1)).toHaveAttribute("aria-pressed", "true");
  const selectedIdentities = await page
    .locator(".piano-roll-note[aria-pressed='true']")
    .evaluateAll(
      (notes) =>
        new Set(
          notes.map(
            (note) =>
              `${note.getAttribute("data-source-step-id")}:${note.getAttribute("data-piano-roll-event-key")}`,
          ),
        ).size,
    );
  expect(selectedIdentities).toBe(1);
  await expect(page.getByRole("complementary", { name: "Selected step" })).toBeVisible();
  await expect(page.locator("svg.piano-roll-note")).toHaveCount(
    await page.getByTestId("piano-roll-note").count(),
  );
  const svgFill = await page
    .locator("svg.piano-roll-note rect")
    .first()
    .evaluate((rect) => getComputedStyle(rect).fill);
  expect(svgFill).not.toBe("none");
  await page.getByTestId("piano-roll-note").nth(2).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("piano-roll-note").nth(3)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("piano-roll-note").nth(3)).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("piano-roll-toolbar").getByRole("button", { name: "Chromatic" }).click();
  await expect(page.getByRole("group", { name: "Melody grid, measure 1" })).toHaveClass(
    /is-chromatic/,
  );
  await page.getByLabel("Horizontal zoom").fill("150");
  await page.getByLabel("Vertical range").selectOption("1");
  await page.getByLabel("Snap resolution").selectOption("1/16 triplet");
  await expect(
    page.locator(".piano-roll-svg").first().locator(".piano-roll-snap-line"),
  ).toHaveCount(25);
  await page.getByLabel("Horizontal zoom").fill("100");
  await page.getByLabel("Vertical range").selectOption("0");
  await page.getByTestId("piano-roll-toolbar").getByRole("button", { name: "Degrees" }).click();

  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("transport-status")).toContainText("Playing");
  await expect(page.locator(".piano-roll-playhead:visible").first()).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.locator(".piano-roll-playhead:visible")).toHaveCount(1);
  await page.screenshot({ path: `${evidenceRoot}/piano-roll-playing-playhead.png` });
  await expect(
    page.locator('.piano-roll-measure[data-measure-index="1"] .piano-roll-playhead'),
  ).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Stop", exact: true }).click();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("progression-global-inspector")).toBeVisible();
  const themeGroup = page.getByRole("group", { name: "Theme" });
  const globalInspector = page.getByTestId("progression-global-inspector");
  await globalInspector.locator("details.progression-view-disclosure").evaluate((details) => {
    (details as HTMLDetailsElement).open = true;
  });
  await globalInspector.getByLabel("Note color mode").selectOption("standard");
  await page.getByTestId("piano-roll-toolbar").getByRole("button", { name: "Degrees" }).click();
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 640, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    for (const theme of ["Light", "Dark"] as const) {
      await themeGroup.getByRole("button", { name: `${theme} theme` }).click();
      await settleLayout(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme.toLowerCase());
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(
        overflow,
        `page horizontal overflow at ${viewport.width} ${theme}`,
      ).toBeLessThanOrEqual(1);
      await page.getByTestId("piano-roll-toolbar").evaluate((toolbar) => {
        toolbar.scrollIntoView({ block: "center", behavior: "instant" });
        const headerBottom =
          document.querySelector<HTMLElement>(".app-header")?.getBoundingClientRect().bottom ?? 0;
        let bounds = toolbar.getBoundingClientRect();
        if (bounds.top < headerBottom + 8)
          window.scrollBy({ top: bounds.top - headerBottom - 8, behavior: "instant" });
        bounds = toolbar.getBoundingClientRect();
        if (bounds.bottom > innerHeight)
          window.scrollBy({ top: bounds.bottom - innerHeight + 2, behavior: "instant" });
      });
      await expect(page.getByTestId("piano-roll-toolbar")).toBeInViewport();
      const controlRect = await page.getByTestId("piano-roll-toolbar").evaluate((toolbar) => {
        const bounds = toolbar.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom, viewportHeight: innerHeight };
      });
      expect(controlRect.top).toBeGreaterThanOrEqual(0);
      expect(controlRect.bottom).toBeLessThanOrEqual(controlRect.viewportHeight);
      await scrollGridIntoView(page);
      await expect(page.locator(".piano-roll-grid.is-degrees").first()).toBeVisible();
      await page.screenshot({
        path: `${evidenceRoot}/piano-roll-${viewport.width}x${viewport.height}-${theme.toLowerCase()}.png`,
      });
      await page.screenshot({
        path: `${evidenceRoot}/piano-roll-${viewport.width}x${viewport.height}-${theme.toLowerCase()}-full.png`,
        fullPage: true,
      });
      await page
        .getByTestId("piano-roll-toolbar")
        .evaluate((toolbar) => toolbar.scrollIntoView({ block: "center", behavior: "instant" }));
      await settleLayout(page);
      await expect(page.getByTestId("piano-roll-toolbar")).toBeInViewport();
      await page.screenshot({
        path: `${evidenceRoot}/piano-roll-${viewport.width}x${viewport.height}-${theme.toLowerCase()}-controls.png`,
      });
      await scrollGridIntoView(page);
      await page.screenshot({
        path: `${evidenceRoot}/piano-roll-${viewport.width}x${viewport.height}-${theme.toLowerCase()}-grid.png`,
      });
      await page
        .getByTestId("piano-roll-toolbar")
        .getByRole("button", { name: "Chromatic" })
        .click();
      await settleLayout(page);
      await scrollGridIntoView(page);
      await expect(page.locator(".piano-roll-grid.is-chromatic").first()).toBeVisible();
      await page.screenshot({
        path: `${evidenceRoot}/piano-roll-${viewport.width}x${viewport.height}-${theme.toLowerCase()}-chromatic-grid.png`,
      });
      await page.getByTestId("piano-roll-toolbar").getByRole("button", { name: "Degrees" }).click();
      if (viewport.width === 1920 && theme === "Light") {
        for (const colorMode of ["suzuki", "harmonic-role"] as const) {
          await globalInspector.getByLabel("Note color mode").selectOption(colorMode);
          await settleLayout(page);
          await scrollGridIntoView(page);
          await page.screenshot({
            path: `${evidenceRoot}/piano-roll-${viewport.width}x${viewport.height}-${theme.toLowerCase()}-${colorMode}.png`,
          });
        }
      }
      await globalInspector.getByLabel("Note color mode").selectOption("standard");
    }
  }

  const openProgressionMenu = async () => {
    const track = page.locator(".progression-track");
    await track.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: rect.left + 40,
          clientY: Math.max(100, rect.top + 40),
        }),
      );
    });
  };
  await openProgressionMenu();
  const progressionMenu = page.getByRole("menu", { name: /My Progression/ });
  await expect(progressionMenu).toBeVisible({ timeout: 5_000 });
  const addRestMenuItem = progressionMenu.getByRole("menuitem", { name: "Add Rest at End" });
  await expect(addRestMenuItem).toBeVisible({ timeout: 5_000 });
  await addRestMenuItem.click();
  await expect(page.locator(".piano-roll-chord.is-rest")).toHaveCount(1);
  await page
    .getByTestId("progression-view-btn-piano")
    .evaluate((button) => (button as HTMLButtonElement).click());
  const authoredRestStep = page
    .getByTestId("progression-step")
    .last()
    .locator("[data-progression-step-select]");
  const authoredRestStepId = await authoredRestStep.getAttribute("data-step-id");
  await authoredRestStep.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    button.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: rect.left + 20,
        clientY: rect.top + 20,
      }),
    );
  });
  const restMelodyMenu = page.getByRole("menu", { name: /Melody actions/ });
  await expect(restMelodyMenu).toBeVisible({ timeout: 5_000 });
  const createRestMelody = restMelodyMenu.getByRole("menuitem", { name: "Create Melody…" });
  await expect(createRestMelody).toBeVisible({ timeout: 5_000 });
  await createRestMelody.click();
  const authoredRestDialog = page.getByRole("dialog", { name: "Create Melody" });
  await authoredRestDialog.getByRole("button", { name: "Authored notes" }).click();
  await authoredRestDialog.getByLabel("Authored pitch MIDI").fill("72");
  await authoredRestDialog.getByLabel("Authored onset numerator").fill("0");
  await authoredRestDialog.getByLabel("Authored onset denominator").fill("1");
  await authoredRestDialog.getByLabel("Authored duration numerator").fill("1");
  await authoredRestDialog.getByLabel("Authored duration denominator").fill("1");
  await authoredRestDialog.getByRole("button", { name: "Add note" }).click();
  await authoredRestDialog.getByRole("button", { name: "Apply Melody" }).click();
  await page
    .getByTestId("progression-view-btn-piano-roll")
    .evaluate((button) => (button as HTMLButtonElement).click());
  const restNote = page.locator(
    `button.piano-roll-note[data-source-step-id="${authoredRestStepId}"]`,
  );
  await expect(restNote).toBeVisible();
  await expect(restNote).toHaveAttribute("data-generated", "false");

  const fixtureDownload = page.waitForEvent("download");
  await page.getByTestId("export-menu-toggle").click();
  await page.getByRole("menu", { name: "Export menu" }).getByTestId("project-export-btn").click();
  const exportedFixture = await fixtureDownload;
  const fixturePath = await exportedFixture.path();
  if (!fixturePath) throw new Error("Could not read the portable Piano Roll fixture");
  const sourceProject = JSON.parse(await readFile(fixturePath, "utf8")) as PortableFixtureProject;
  const sourceSteps = sourceProject.progression.steps;
  const chordOwners = sourceSteps.filter(
    (step) => step.kind === "chord" && step.melody?.mode === "authored",
  );
  const restOwner = sourceSteps.find(
    (step) => step.kind === "rest" && step.authoredMelody?.notes?.length,
  );
  if (chordOwners.length < 2 || !restOwner)
    throw new Error("Portable fixture lacks multiple authored owners and a Rest phrase");
  const duplicateEventId = "shared-phrase-local-id";
  for (const owner of [...chordOwners.slice(0, 2), restOwner]) {
    const note =
      owner.kind === "rest" ? owner.authoredMelody!.notes[0]! : owner.melody!.phrase!.notes[0]!;
    note.id = duplicateEventId;
  }
  const importedProjectText = JSON.stringify(sourceProject);
  await page.keyboard.press("Escape");
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: "piano-roll-duplicate-owners.cadenceflow",
    mimeType: "application/json",
    buffer: Buffer.from(importedProjectText),
  });
  await expect(page.getByTestId("project-menu-toggle")).toContainText(sourceProject.name);
  await page.getByTestId("progression-view-btn-piano-roll").click();
  const duplicatePhraseKeys = page.locator(
    `button.piano-roll-note[data-piano-roll-event-key="${duplicateEventId}"]`,
  );
  await expect(duplicatePhraseKeys).toHaveCount(3);
  const duplicateOwners = await duplicatePhraseKeys.evaluateAll(
    (notes) => new Set(notes.map((note) => note.getAttribute("data-source-step-id"))).size,
  );
  expect(duplicateOwners).toBe(3);
  expect(
    sourceProject.progression.steps.some((step) =>
      (step.melody?.phrase?.notes ?? step.authoredMelody?.notes ?? []).some(
        (note) => note.id === duplicateEventId,
      ),
    ),
  ).toBe(true);
  expect(JSON.parse(await readFile(fixturePath, "utf8"))).not.toEqual(sourceProject);
  await duplicatePhraseKeys.nth(0).click();
  await expect(page.locator("button.piano-roll-note[aria-pressed='true']")).toHaveCount(1);
  await duplicatePhraseKeys.nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("button.piano-roll-note[aria-pressed='true']")).toHaveCount(1);
  await expect(duplicatePhraseKeys.nth(1)).toHaveAttribute("aria-pressed", "true");
  await restNote.click();
  await expect(page.locator("button.piano-roll-note[aria-pressed='true']")).toHaveCount(1);
  await expect(restNote).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 1920, height: 1080 });
  const restHarmony = page.locator(".piano-roll-chord.is-rest");
  await restHarmony.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await settleLayout(page);
  const restCombinedGeometry = await page.evaluate((stepId) => {
    const note = document.querySelector<HTMLElement>(
      `.piano-roll-note[data-source-step-id="${stepId}"]`,
    );
    const harmony = document.querySelector<HTMLElement>(".piano-roll-chord.is-rest");
    if (!note || !harmony) return { note: false, harmony: false };
    const noteRect = note.getBoundingClientRect();
    const harmonyRect = harmony.getBoundingClientRect();
    return {
      note: noteRect.bottom > 0 && noteRect.top < innerHeight,
      harmony: harmonyRect.bottom > 0 && harmonyRect.top < innerHeight,
    };
  }, authoredRestStepId);
  expect(restCombinedGeometry.note && restCombinedGeometry.harmony).toBe(true);
  await page.screenshot({ path: `${evidenceRoot}/piano-roll-authored-rest-notes-and-harmony.png` });
  await page.setViewportSize({ width: 640, height: 360 });
  await settleLayout(page);
  await page.getByLabel("Vertical range").selectOption("1");
  await settleLayout(page);
  await restHarmony.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await settleLayout(page);
  await expect(
    page.locator(`.piano-roll-note[data-source-step-id="${authoredRestStepId}"]`),
  ).toBeAttached();
  await expect(page.locator(".piano-roll-chord.is-rest")).toBeAttached();
  await page.screenshot({
    path: `${evidenceRoot}/piano-roll-640x360-dark-authored-rest-full.png`,
    fullPage: true,
  });
  await page.screenshot({
    path: `${evidenceRoot}/piano-roll-authored-rest-duplicate-key-full.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const playingRest = page.locator(".piano-roll-chord.is-rest.is-playing");
  await expect(playingRest).toBeVisible({ timeout: 8_000 });
  await expect(page.locator(".piano-roll-playhead:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "Stop", exact: true }).click();

  await page.waitForTimeout(800);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("progression-view-btn-piano-roll")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
