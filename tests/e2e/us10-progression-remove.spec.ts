import { expect, test, type Page } from "@playwright/test";
import { ensureHistoryControlsVisible } from "./test-helpers/global-settings";
import { addRestToProgression, setProgressionView } from "./test-helpers/progression-settings";

async function addChord(page: Page, functionId: string): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
}

async function readProgressionIdentity(page: Page): Promise<string[]> {
  return page.locator(".measure-staff-event-select").evaluateAll((events) => {
    const seenStepIds = new Set<string>();
    return events.flatMap((event) => {
      const stepId = event.getAttribute("data-step-id");
      if (stepId && seenStepIds.has(stepId)) return [];
      if (stepId) seenStepIds.add(stepId);
      const label = event.getAttribute("aria-label") ?? "";
      if (label.startsWith("Select Rest:")) return ["Rest"];
      return [label.replace(/^Select /, "").split(/ · |:/, 1)[0] ?? ""];
    });
  });
}

async function readLogicalStepIds(page: Page): Promise<string[]> {
  return page
    .locator(".measure-staff-event-select")
    .evaluateAll(
      (events) =>
        [
          ...new Set(events.map((event) => event.getAttribute("data-step-id")).filter(Boolean)),
        ] as string[],
    );
}

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("main", { name: "CadenceFlow Studio" })).toBeVisible();
  await setProgressionView(page, "staff");
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (
      window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
  await waitForStudio(page);
  await ensureHistoryControlsVisible(page);
});

test.describe("US10 — Staff event chord clearing", () => {
  test("Delete Chord changes the same Step to Rest and Undo/Redo preserves identity", async ({
    page,
  }) => {
    await addChord(page, "I");
    await addChord(page, "vi");
    await addRestToProgression(page);
    await addChord(page, "IV");

    const steps = page.locator(".measure-staff-event-select");
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "vi", "Rest", "IV"]);
    const idsBefore = await readLogicalStepIds(page);
    expect(idsBefore).toHaveLength(4);
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "vi", "Rest", "IV"]);

    await steps.nth(1).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete Chord" }).click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "Rest", "Rest", "IV"]);
    await expect(steps.nth(1)).toHaveAttribute("data-step-id", idsBefore[1]!);

    await page.keyboard.press("Control+z");
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "vi", "Rest", "IV"]);
    await page.keyboard.press("Control+y");
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "Rest", "Rest", "IV"]);

    await steps.nth(1).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete Rest" }).click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "Rest", "Rest", "IV"]);
    await page.keyboard.press("Control+z");
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "vi", "Rest", "IV"]);
  });

  test("Delete clears selected Harmony while keeping the selected Step and history", async ({
    page,
  }) => {
    await addChord(page, "I");
    await addChord(page, "vi");
    const steps = page.locator(".measure-staff-event-select");
    await expect(steps).toHaveCount(2);
    const second = steps.nth(1);
    const secondId = await second.getAttribute("data-step-id");
    await second.click();
    await second.focus();
    await page.keyboard.press("Delete");

    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "Rest"]);
    await expect(steps.nth(1)).toHaveAttribute("data-step-id", secondId!);
    await expect(steps.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("step-performance-inspector")).toHaveAttribute(
      "aria-label",
      "Settings for selected Rest step",
    );

    await page.keyboard.press("Control+z");
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "vi"]);
    await page.keyboard.press("Control+y");
    await expect(readProgressionIdentity(page)).resolves.toEqual(["I", "Rest"]);
  });

  test("clearing other Staff events does not move the selected Step", async ({ page }) => {
    await addChord(page, "I");
    await addChord(page, "vi");
    await addChord(page, "IV");

    const steps = page.locator(".measure-staff-event-select");
    await steps.nth(1).click();
    await expect(steps.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("region", { name: "Performance settings for step vi" }),
    ).toBeVisible();

    await steps.nth(0).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete Chord" }).click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["Rest", "vi", "IV"]);
    await expect(steps.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("region", { name: "Performance settings for step vi" }),
    ).toBeVisible();

    await steps.nth(2).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete Chord" }).click();
    await expect(readProgressionIdentity(page)).resolves.toEqual(["Rest", "vi", "Rest"]);
    await expect(steps.nth(1)).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("US10 — Staff event controls at desktop sizes", () => {
  for (const viewport of [
    { name: "1280x720", width: 1280, height: 720 },
    { name: "1920x1080", width: 1920, height: 1080 },
  ]) {
    test(viewport.name, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await addChord(page, "I");
      await addChord(page, "vi");
      await addRestToProgression(page);

      const metrics = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>(
          "[data-testid='progression-score-systems']",
        );
        const events = [...document.querySelectorAll<HTMLElement>(".measure-staff-event-select")];
        if (!root) throw new Error("Staff progression is missing");
        const rootBounds = root.getBoundingClientRect();
        return {
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          events: events.map((event) => {
            const bounds = event.getBoundingClientRect();
            return {
              width: bounds.width,
              height: bounds.height,
              left: bounds.left,
              right: bounds.right,
              rootLeft: rootBounds.left,
              rootRight: rootBounds.right,
            };
          }),
        };
      });

      expect(metrics.pageOverflow).toBeLessThanOrEqual(0);
      expect(metrics.events).toHaveLength(3);
      for (const event of metrics.events) {
        expect(event.width).toBeGreaterThan(0);
        expect(event.height).toBeGreaterThan(0);
        expect(event.left).toBeGreaterThanOrEqual(event.rootLeft - 1);
        expect(event.right).toBeLessThanOrEqual(event.rootRight + 1);
      }

      const rest = page.locator(".measure-staff-event.is-rest .measure-staff-event-select");
      await rest.click({ button: "right" });
      await expect(page.getByRole("menuitem", { name: "Delete Rest" })).toBeVisible();
    });
  }
});
