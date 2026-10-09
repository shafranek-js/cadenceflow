import { expect, test, type Page } from "@playwright/test";
import {
  addRestToProgression,
  setProgressionView,
  startBranchAlternative,
} from "./test-helpers/progression-settings";

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Harmonic Matrix" })).toBeVisible();
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
  await setProgressionView(page, "staff");
}

async function addChord(page: Page, functionId: string): Promise<void> {
  const card = page.getByTestId(`chord-card-${functionId}`);
  await card.locator(".chord-main").click({ modifiers: ["Control"] });
}

async function addProgression(page: Page, count: number): Promise<void> {
  const functions = ["I", "vi", "IV", "V"] as const;
  for (let index = 0; index < count; index += 1) {
    await addChord(page, functions[index % functions.length]!);
  }
}

async function readPageOverflow(page: Page) {
  return page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
    scrollX: window.scrollX,
  }));
}

test.describe("US10 Batch 2 — Matrix and Progression visual system", () => {
  test("keeps the empty-state guidance and makes Matrix card anatomy scannable", async ({
    page,
  }) => {
    await waitForStudio(page);
    await expect(page.getByTestId("progression-empty-state")).toContainText(
      "Pick one starting point.",
    );
    await expect(page.getByTestId("progression-empty-state")).toContainText(
      "Previewing is safe; only an explicit Add or Apply changes your progression.",
    );

    await addChord(page, "I");
    const card = page.getByTestId("chord-card-I");
    await expect(card.locator(".chord-card-status-row")).toBeVisible();
    await expect(card.getByTestId("chord-card-notes")).toContainText("C");
    await expect(card.locator(".chord-main")).toHaveAttribute(
      "title",
      "Click or Enter to preview; Ctrl-click or Ctrl+Enter to add; when selected, press + to add to My Progression; Alt-click to reset card settings",
    );
    await expect(page.getByLabel("Global Card View")).toBeVisible();
    await expect(card.getByRole("group", { name: "View for I" })).toHaveCount(0);
    await expect(card.locator(".card-view-glyph")).toHaveCount(0);

    const recommendationCards = page.locator(
      '.chord-card[data-recommendation="best"], .chord-card[data-recommendation="alternative"]',
    );
    await expect(recommendationCards.first()).toBeVisible();
    await expect(recommendationCards.first().locator(".recommendation-badge")).toBeVisible();
    await expect(recommendationCards.first().locator(".chord-main")).toBeVisible();
  });

  test("keeps long progression order and Rest parity across Staff and Piano Roll", async ({
    page,
  }) => {
    await waitForStudio(page);
    await addProgression(page, 20);
    await addRestToProgression(page);

    const steps = page.locator(".measure-staff-event-select");
    await expect(steps).toHaveCount(21);
    await expect(steps.first()).toHaveAttribute("aria-label", /Select I ·/);
    await expect(steps.last()).toHaveAttribute("aria-label", /Select Rest:/);

    const flow = await page.evaluate(() => {
      const track = document.querySelector<HTMLElement>(
        "[data-testid='progression-score-systems']",
      );
      const events = [...document.querySelectorAll<HTMLElement>(".measure-staff-event-select")];
      if (!track) throw new Error("Progression track is missing");
      return {
        eventCount: events.length,
        distinctStepIds: new Set(events.map((event) => event.dataset.stepId)).size,
        scrollWidth: track.scrollWidth,
        clientWidth: track.clientWidth,
      };
    });
    expect(flow.eventCount).toBe(21);
    expect(flow.distinctStepIds).toBe(21);
    expect(flow.scrollWidth).toBeLessThanOrEqual(flow.clientWidth);

    await setProgressionView(page, "piano-roll");
    await page.getByRole("button", { name: "Show piano chord", exact: true }).first().click();
    const pianoCards = page.getByTestId("piano-roll-piano-cards");
    await expect(pianoCards.locator(".piano-roll-instrument-card")).toHaveCount(20);
    const firstPiano = pianoCards.locator(".piano-roll-instrument-card").first();
    await expect(firstPiano.locator(".mini-piano")).toBeVisible();
    await expect(firstPiano.locator(".mini-key.is-active")).not.toHaveCount(0);

    await setProgressionView(page, "staff");
    await expect(page.getByTestId("progression-score-systems")).toBeVisible();
    await expect(
      page.getByTestId("progression-score-systems").locator(".measure-staff-event-select").first(),
    ).toBeVisible();
    await expect(page.locator('[data-view="staff"] [data-testid="progression-step"]')).toHaveCount(
      0,
    );

    const overflow = await readPageOverflow(page);
    expect(overflow.documentScrollWidth).toBeLessThanOrEqual(overflow.documentClientWidth);
    expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
    expect(overflow.scrollX).toBe(0);
  });

  test("keeps temporary branch presentation explicit without changing My Progression", async ({
    page,
  }) => {
    await waitForStudio(page);
    await addProgression(page, 4);
    const stepCountBeforeBranch = await page.locator(".measure-staff-event-select").count();

    await startBranchAlternative(page, 1);
    await expect(page.getByTestId("branch-controls-active")).toContainText("Temporary branch");
    await expect(page.getByText("What-if branch active", { exact: true })).toBeVisible();

    await page.getByTestId("chord-card-ii").locator(".chord-main").click();
    await expect(page.getByRole("region", { name: "Original versus Alternative" })).toBeVisible();
    await expect(page.getByTestId("branch-alternative-path")).toContainText("ii");
    await expect(page.locator(".measure-staff-event-select")).toHaveCount(stepCountBeforeBranch);
  });

  test("keeps the global Matrix card view readable in Piano and Staff modes", async ({ page }) => {
    await waitForStudio(page);
    const card = page.getByTestId("chord-card-I");
    const globalView = page.getByLabel("Global Card View");
    await globalView.selectOption("piano");
    await expect(card.locator(".mini-piano")).toBeVisible();
    await expect(card.locator(".mini-key.is-active")).not.toHaveCount(0);

    await globalView.selectOption("staff");
    await expect(card.locator(".mini-staff")).toBeVisible();
    await expect(card.locator(".mini-staff")).toHaveAttribute("aria-label", /staff realization:/);
    await expect(globalView).toHaveValue("staff");
    await expect(card.locator(".card-view-switcher")).toHaveCount(0);
  });
});
