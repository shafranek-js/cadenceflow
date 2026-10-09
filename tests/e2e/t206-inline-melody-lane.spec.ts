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
  await page.locator(".measure-staff-event-select").nth(index).click();
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
  const note = page
    .locator(`.score-system .melody-staff-note[data-step-id="${sourceStepId}"]`)
    .first();
  const chord = page
    .locator(
      `.measure-staff-event:has(> .measure-staff-event-select[data-step-id="${sourceStepId}"])`,
    )
    .first();
  await expect
    .poll(async () => {
      const melodyPosition = await note.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).getPropertyValue("--melody-staff-event-x")),
      );
      const chordPosition = await chord.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).getPropertyValue("--measure-staff-event-x")),
      );
      return Math.abs(melodyPosition - chordPosition);
    })
    .toBeLessThanOrEqual(0.1);
  return note.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).getPropertyValue("--melody-staff-event-x")),
  );
}

test.describe("T206 — read-only inline Melody Lane", () => {
  test("aligns generated lanes, keeps duplicate Step ownership, and opens the editor", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openStudio(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await setProgressionView(page, "staff");
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
      .locator(".measure-staff-event-select")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-step-id")));
    expect(progressionStepIds).toHaveLength(4);
    await createMelodyForStep(page, 0, "cello");
    await createMelodyForStep(page, 1, "violin");
    await createMelodyForStep(page, 2, "flute");

    const notes = page.locator(".score-system .melody-staff-note");
    await expect(notes).not.toHaveCount(0);
    const noteMetadata = await notes.evaluateAll((elements) =>
      elements.map((element) => ({
        stepId: element.getAttribute("data-step-id"),
        instrument: element.getAttribute("data-melody-instrument"),
        label: element.getAttribute("aria-label") ?? "",
      })),
    );
    expect(noteMetadata.every(({ label }) => /Melody \w+, [A-G][#b]?\d/.test(label))).toBe(true);
    expect(noteMetadata.every(({ label }) => /onset .* beats/.test(label))).toBe(true);
    expect(noteMetadata.every(({ label }) => /source chord /.test(label))).toBe(true);
    expect(new Set(noteMetadata.map(({ instrument }) => instrument))).toEqual(
      new Set(["cello", "violin", "flute"]),
    );

    const owners = [
      ...new Set(noteMetadata.map(({ stepId }) => stepId).filter(Boolean)),
    ] as string[];
    expect(owners).toHaveLength(3);
    const ownerId = owners[1]!;
    await page.setViewportSize({ width: 1280, height: 720 });
    const desktopOnsets: number[] = [];
    for (const stepId of owners) {
      desktopOnsets.push(await expectMelodyHarmonyOnsetAlignment(page, stepId));
    }
    expect(new Set(desktopOnsets.map((position) => Math.round(position))).size).toBe(3);
    const noteForStepTwo = page
      .locator(`.score-system .melody-staff-note[data-step-id="${ownerId}"]`)
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

    for (const theme of ["Dark theme", "Light theme"] as const) {
      await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: theme }).click();
      for (const viewport of [
        { width: 1280, height: 720 },
        { width: 640, height: 360 },
      ]) {
        await page.setViewportSize(viewport);
        await expect(page.locator(".score-system .melody-staff-note").first()).toBeVisible();
        for (const stepId of owners) await expectMelodyHarmonyOnsetAlignment(page, stepId);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        ).toBeLessThanOrEqual(0);
      }
    }
  });
});
