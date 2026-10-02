import { expect, test, type Page } from "@playwright/test";
import { setProgressionView } from "./test-helpers/progression-settings";

async function openStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
}

async function addChord(page: Page, functionId: string): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
}

async function setStepDuration(
  page: Page,
  index: number,
  preset: "duration-preset-eighth" | "duration-preset-quarter" | "duration-preset-half",
): Promise<void> {
  await page
    .getByTestId("progression-step")
    .nth(index)
    .locator("[data-progression-step-select]")
    .click();
  await page.getByTestId("step-performance-inspector").getByTestId(preset).click();
}

async function createMelodyForStep(
  page: Page,
  stepIndex: number,
  instrument: "cello" | "violin" | "flute",
): Promise<void> {
  const invoker = page.locator(".measure-staff-event .measure-staff-event-select").nth(stepIndex);
  await invoker.click({ button: "right" });
  const menu = page.getByRole("menu", { name: /Melody actions/ });
  await menu.getByRole("menuitem", { name: "Create Melody…" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Melody" });
  await dialog.getByLabel("Melody Instrument", { exact: true }).selectOption(instrument);
  await dialog.getByRole("button", { name: "Apply Melody" }).click();
  await expect(dialog).toHaveCount(0);
}

async function expectMelodyHarmonyOnsetAlignment(
  page: Page,
  sourceStepId: string,
): Promise<number> {
  const geometry = await page
    .locator(`[data-testid="melody-lane-note"][data-source-step-id="${sourceStepId}"]`)
    .first()
    .evaluate((note, stepId) => {
      const melodySegment = note.closest<HTMLElement>(".inline-melody-lane-column");
      const measure = note.closest<HTMLElement>("[data-testid=progression-measure]");
      const melodyTrack = measure?.querySelector<HTMLElement>("[data-testid=melody-lane-track]");
      const harmonySegment = measure?.querySelector<HTMLElement>(
        `.progression-measure-grid [data-progression-step-drag][data-step-id="${stepId}"]`,
      );
      const harmonyGrid = measure?.querySelector<HTMLElement>(".progression-measure-grid");
      return {
        melodyLeft: melodySegment?.getBoundingClientRect().left,
        harmonyLeft: harmonySegment?.getBoundingClientRect().left,
        melodyTrackWidth: melodyTrack?.getBoundingClientRect().width,
        harmonyGridWidth: harmonyGrid?.getBoundingClientRect().width,
        melodyTrackScrollWidth: melodyTrack?.scrollWidth,
        harmonyGridScrollWidth: harmonyGrid?.scrollWidth,
      };
    }, sourceStepId);
  expect(geometry.melodyLeft).toBeDefined();
  expect(geometry.harmonyLeft).toBeDefined();
  expect(geometry.melodyTrackWidth).toBeDefined();
  expect(geometry.harmonyGridWidth).toBeDefined();
  expect(Math.abs(geometry.melodyTrackWidth! - geometry.harmonyGridWidth!)).toBeLessThanOrEqual(2);
  expect(
    Math.abs(geometry.melodyTrackScrollWidth! - geometry.harmonyGridScrollWidth!),
  ).toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.melodyLeft! - geometry.harmonyLeft!)).toBeLessThanOrEqual(2);
  return geometry.melodyLeft!;
}

test.describe("T206 — read-only inline Melody Lane", () => {
  test("aligns generated lanes, keeps duplicate Step ownership, and opens the editor", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openStudio(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    const durationPresets = [
      "duration-preset-eighth",
      "duration-preset-quarter",
      "duration-preset-half",
      "duration-preset-eighth",
    ] as const;
    for (let index = 0; index < durationPresets.length; index += 1) {
      await addChord(page, "I");
      await setStepDuration(page, index, durationPresets[index]!);
    }
    const progressionStepIds = await page
      .locator("[data-progression-step-select]")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-step-id")));
    expect(progressionStepIds).toHaveLength(4);
    await setProgressionView(page, "staff");
    await createMelodyForStep(page, 0, "cello");
    await createMelodyForStep(page, 1, "violin");
    await createMelodyForStep(page, 2, "flute");

    await setProgressionView(page, "harmonic");
    const lane = page.getByTestId("melody-lane");
    await expect(lane).not.toHaveCount(0);
    await expect(
      page.locator('[data-testid="melody-lane-row"][data-melody-instrument="cello"]'),
    ).not.toHaveCount(0);
    await expect(
      page.locator('[data-testid="melody-lane-row"][data-melody-instrument="violin"]'),
    ).not.toHaveCount(0);
    await expect(
      page.locator('[data-testid="melody-lane-row"][data-melody-instrument="flute"]'),
    ).not.toHaveCount(0);

    const notes = page.getByTestId("melody-lane-note");
    await expect(notes).not.toHaveCount(0);
    const noteLabels = await notes.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("aria-label") ?? ""),
    );
    expect(noteLabels.every((label) => /pitch /.test(label))).toBe(true);
    expect(noteLabels.every((label) => /primary role /.test(label))).toBe(true);
    expect(noteLabels.every((label) => /target-next: (yes|no)/.test(label))).toBe(true);

    const sourceStepIds = await notes.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-source-step-id")),
    );
    const owners = [...new Set(sourceStepIds.filter((id): id is string => Boolean(id)))];
    expect(owners).toHaveLength(3);
    const rationalOnsets = await Promise.all(
      owners.map((stepId) =>
        page
          .locator(`[data-testid="melody-lane-note"][data-source-step-id="${stepId}"]`)
          .first()
          .getAttribute("data-start-beats"),
      ),
    );
    expect(rationalOnsets).toEqual(["0/1", "1/2", "3/2"]);
    const ownerId = owners[1]!;
    const timelineScroll = page.getByTestId("progression-measure-timeline").first();
    await page.setViewportSize({ width: 1280, height: 720 });
    const desktopOnsets: number[] = [];
    for (const stepId of owners) {
      desktopOnsets.push(await expectMelodyHarmonyOnsetAlignment(page, stepId));
    }
    expect(new Set(desktopOnsets.map((position) => Math.round(position))).size).toBe(3);
    for (const view of ["piano", "guitar"] as const) {
      await setProgressionView(page, view);
      await expect(page.getByTestId("progression-step")).toHaveCount(4);
      for (const stepId of owners) await expectMelodyHarmonyOnsetAlignment(page, stepId);
    }
    await setProgressionView(page, "harmonic");

    await page.setViewportSize({ width: 640, height: 360 });
    await expect
      .poll(() => timelineScroll.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeGreaterThan(0);
    await timelineScroll.evaluate((element) => {
      element.scrollLeft = Math.min(140, element.scrollWidth - element.clientWidth);
    });
    const mobileOnsets: number[] = [];
    for (const stepId of owners) {
      mobileOnsets.push(await expectMelodyHarmonyOnsetAlignment(page, stepId));
    }
    expect(new Set(mobileOnsets.map((position) => Math.round(position))).size).toBe(3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);

    const noteForStepTwo = page
      .locator(`[data-testid="melody-lane-note"][data-source-step-id="${ownerId}"]`)
      .first();
    await noteForStepTwo.click();
    await expect(
      page.locator(`[data-progression-step-select][data-step-id="${ownerId}"]`),
    ).toHaveAttribute("aria-pressed", "true");

    await noteForStepTwo.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.locator(`[data-progression-step-select][data-step-id="${ownerId}"]`),
    ).toHaveAttribute("aria-pressed", "true");

    await noteForStepTwo.dblclick();
    const dialog = page.getByRole("dialog", { name: "Edit Melody" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await setProgressionView(page, "staff");
    await expect(page.getByTestId("melody-lane")).toHaveCount(0);
    await expect(page.locator(".score-system .melody-staff-note")).not.toHaveCount(0);

    for (const theme of ["Dark theme", "Light theme"] as const) {
      await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: theme }).click();
      await setProgressionView(page, "harmonic");
      for (const viewport of [
        { width: 1280, height: 720 },
        { width: 640, height: 360 },
      ]) {
        await page.setViewportSize(viewport);
        await expect(page.getByTestId("melody-lane").first()).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        ).toBeLessThanOrEqual(0);
      }
      await setProgressionView(page, "staff");
    }
  });
});
