import { expect, test, type Page } from "@playwright/test";

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Harmonic Matrix" })).toBeVisible();
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
}

async function addChord(page: Page, functionId: string): Promise<void> {
  const card = page.getByTestId(`chord-card-${functionId}`);
  await card
    .getByRole("button", { name: new RegExp(`Add ${functionId} to progression`, "i") })
    .click();
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
      "Preview a chord in the Matrix, then press + to add it.",
    );

    await addChord(page, "I");
    const card = page.getByTestId("chord-card-I");
    await expect(card.locator(".chord-card-status-row")).toBeVisible();
    await expect(card.getByRole("button", { name: "Add I to progression" })).toHaveAttribute(
      "title",
      "Add to My Progression",
    );
    await expect(card.getByRole("group", { name: "View for I" })).toBeVisible();
    await expect(card.locator(".card-view-glyph")).toHaveCount(3);

    const recommendationCards = page.locator(
      '.chord-card[data-recommendation="best"], .chord-card[data-recommendation="alternative"]',
    );
    await expect(recommendationCards.first()).toBeVisible();
    await expect(recommendationCards.first().locator(".recommendation-badge")).toBeVisible();
    await expect(recommendationCards.first().locator(".chord-main")).toBeVisible();
  });

  test("keeps long progression order, Rest parity, local drop affordances, and view readability", async ({
    page,
  }) => {
    await waitForStudio(page);
    await addProgression(page, 20);
    await page.getByRole("button", { name: "Add Rest to progression" }).click();

    const steps = page.locator('[data-testid="progression-step"]');
    await expect(steps).toHaveCount(21);
    await expect(steps.nth(0).getByTestId("progression-step-number")).toHaveText("1");
    await expect(steps.last()).toContainText("Rest");
    await expect(steps.last().getByTestId("progression-step-remove")).toBeVisible();

    const flow = await page.evaluate(() => {
      const track = document.querySelector<HTMLElement>(".progression-step-cards");
      const cards = [...document.querySelectorAll<HTMLElement>('[data-testid="progression-step"]')];
      if (!track) throw new Error("Progression track is missing");
      const rects = cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { top: Math.round(rect.top), left: Math.round(rect.left), width: rect.width };
      });
      return {
        rows: new Set(rects.map((rect) => rect.top)).size,
        rowMajor: rects.every((rect, index) => {
          const previous = rects[index - 1];
          return (
            !previous ||
            rect.top > previous.top ||
            (rect.top === previous.top && rect.left > previous.left)
          );
        }),
        widths: [...new Set(rects.map((rect) => Math.round(rect.width)))],
        scrollWidth: track.scrollWidth,
        clientWidth: track.clientWidth,
      };
    });
    expect(flow.rows).toBeGreaterThan(1);
    expect(flow.rowMajor).toBe(true);
    expect(flow.widths).toEqual([170]);
    expect(flow.scrollWidth).toBeLessThanOrEqual(flow.clientWidth);

    await page.getByLabel("Progression Card View").selectOption("piano");
    await expect(steps.first().locator(".mini-piano")).toBeVisible();
    await expect(steps.first().locator(".mini-key.is-active")).not.toHaveCount(0);
    await page.getByLabel("Progression Card View").selectOption("staff");
    await expect(steps.first().locator(".mini-staff")).toBeVisible();

    const remove = steps.first().getByTestId("progression-step-remove");
    const dragFromControl = await remove.evaluate((button) => {
      const transfer = new DataTransfer();
      const event = new DragEvent("dragstart", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      });
      button.dispatchEvent(event);
      return { defaultPrevented: event.defaultPrevented, payload: transfer.getData("text/plain") };
    });
    expect(dragFromControl.defaultPrevented).toBe(true);
    expect(dragFromControl.payload).toBe("");

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
    const stepCountBeforeBranch = await page.locator('[data-testid="progression-step"]').count();

    await page.getByLabel("Branch origin").selectOption({ label: "After 2: vi" });
    await page.getByRole("button", { name: "Explore Alternative" }).click();
    await expect(page.getByTestId("branch-controls-active")).toContainText("Temporary branch");
    await expect(page.getByText("What-if branch active", { exact: true })).toBeVisible();

    await page.getByTestId("chord-card-ii").locator(".chord-main").click();
    await expect(page.getByRole("region", { name: "Original versus Alternative" })).toBeVisible();
    await expect(page.getByTestId("branch-alternative-path")).toContainText("ii");
    await expect(page.locator('[data-testid="progression-step"]')).toHaveCount(
      stepCountBeforeBranch,
    );
  });

  test("keeps Matrix card views compact and readable in Piano and Staff modes", async ({
    page,
  }) => {
    await waitForStudio(page);
    const card = page.getByTestId("chord-card-I");
    await card.getByRole("button", { name: "piano" }).click();
    await expect(card.locator(".mini-piano")).toBeVisible();
    await expect(card.locator(".mini-key.is-active")).not.toHaveCount(0);

    await card.getByRole("button", { name: "staff" }).click();
    await expect(card.locator(".mini-staff")).toBeVisible();
    await expect(card.locator(".mini-staff")).toHaveAttribute("aria-label", /Staff realization:/);
    await expect(card.locator(".card-view-switcher button[data-view=staff]")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
