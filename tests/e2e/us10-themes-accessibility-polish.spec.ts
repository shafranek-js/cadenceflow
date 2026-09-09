import { expect, test, type Locator, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const testWindow = window as unknown as {
      __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean;
    };
    testWindow.__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
});

async function waitForStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("main", { name: "CadenceFlow Studio" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Playback Transport" })).toBeVisible();
}

async function readProgression(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid="progression-step"]')
    .evaluateAll((steps) =>
      steps.map(
        (step) =>
          step.querySelector('[data-testid="step-function"]')?.textContent?.trim() ?? "Rest",
      ),
    );
}

async function expectNoPageHorizontalScroll(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
    scrollX: window.scrollX,
  }));
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.documentClientWidth);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expect(metrics.scrollX).toBe(0);
}

async function contrastRatio(page: Page, locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const parse = (value: string): [number, number, number] => {
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) throw new Error(`Expected computed RGB color, received ${value}`);
      return [Number(match[1]), Number(match[2]), Number(match[3])];
    };
    const luminance = (rgb: [number, number, number]) =>
      rgb
        .map((channel) => channel / 255)
        .map((channel) =>
          channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
        )
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
    const styles = getComputedStyle(element);
    const foreground = luminance(parse(styles.color));
    const background = luminance(parse(styles.backgroundColor));
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
}

test.describe("US10 Batch 5 — themes and accessibility polish", () => {
  test("preserves semantic state priority and musical state across both themes", async ({
    page,
  }) => {
    test.slow();
    await waitForStudio(page);

    await page.getByRole("button", { name: "Add bIII to progression" }).click();
    await page
      .locator('[data-testid="progression-step"]')
      .last()
      .getByRole("button", { name: /Select progression step 1: bIII/ })
      .click();
    await page.getByTestId("chord-card-I").locator(".chord-main").click();
    const bestCard = page.locator('.chord-card[data-recommendation="best"]').first();
    const alternativeCard = page.locator('.chord-card[data-recommendation="alternative"]').first();
    await expect(bestCard).toBeVisible();
    await expect(alternativeCard).toBeVisible();
    const bestCardId = await bestCard.getAttribute("data-testid");
    const alternativeCardId = await alternativeCard.getAttribute("data-testid");
    if (!bestCardId || !alternativeCardId)
      throw new Error("Recommendation card identity is missing");
    const stableBestCard = page.getByTestId(bestCardId);
    const stableAlternativeCard = page.getByTestId(alternativeCardId);

    await stableAlternativeCard.getByRole("button", { name: "Settings for" }).click();
    const template = page.getByRole("region", { name: /Template settings for/ });
    await template.getByRole("combobox").first().selectOption("arp-up");
    await expect(page.getByRole("img", { name: /Customized · 1 overrides/ })).toBeVisible();
    await expect(stableAlternativeCard.locator(".recommendation-alternative-badge")).toContainText(
      "Alternative",
    );

    await stableBestCard.locator(".chord-main").click();
    await expect(stableBestCard).toHaveClass(/is-selected/);
    const bestCollision = await stableBestCard.evaluate((card) => {
      const styles = getComputedStyle(card);
      return {
        outline: styles.outlineColor,
        border: styles.borderTopColor,
        shadow: styles.boxShadow,
        mainBackground: getComputedStyle(card.querySelector(".chord-main")!).backgroundColor,
      };
    });
    expect(bestCollision.outline).not.toBe("transparent");
    expect(bestCollision.border).not.toBe("transparent");
    expect(bestCollision.mainBackground).not.toBe("rgba(0, 0, 0, 0)");

    await page.getByRole("button", { name: "Add I to progression" }).click();
    const progressionStep = page.locator('[data-testid="progression-step"]').last();
    await progressionStep.getByRole("button", { name: /Select progression step 2: I/ }).click();
    const progressionBeforePlayback = await readProgression(page);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.locator(".progression-step-card.is-playing.is-selected")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("transport-status")).toContainText("Playing");
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(page.getByTestId("transport-status")).toContainText("Stopped");

    await page.getByLabel("Branch origin").selectOption({ label: "After 1: bIII" });
    await page.getByRole("button", { name: "Explore Alternative" }).click();
    await expect(page.getByTestId("branch-controls-active")).toContainText("Temporary branch");
    await expect(page.getByText("What-if branch active", { exact: true })).toBeVisible();
    expect(await readProgression(page)).toEqual(progressionBeforePlayback);

    const semanticTokens = [
      "--background",
      "--surface",
      "--surface-hover",
      "--surface-selected",
      "--surface-preview",
      "--surface-warning",
      "--surface-error",
      "--surface-success",
      "--text",
      "--text-muted",
      "--text-disabled",
      "--border",
      "--border-strong",
      "--focus",
      "--selected",
      "--previewed",
      "--recommendation-best",
      "--recommendation-alternative",
      "--playing",
      "--completed",
      "--branch",
      "--customized",
      "--destructive",
      "--warning",
      "--error",
      "--loading",
      "--ready",
      "--disabled",
    ];
    for (const theme of ["dark", "light"] as const) {
      await page
        .getByRole("button", { name: `${theme === "dark" ? "Dark" : "Light"} theme` })
        .click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const tokens = await page.evaluate((names) => {
        const styles = getComputedStyle(document.documentElement);
        return Object.fromEntries(
          names.map((name) => [name, styles.getPropertyValue(name).trim()]),
        );
      }, semanticTokens);
      expect(Object.values(tokens).every(Boolean)).toBe(true);
      expect(await contrastRatio(page, page.locator("body"))).toBeGreaterThanOrEqual(4.5);
      expect(
        await contrastRatio(
          page,
          page.getByRole("button", { name: theme === "dark" ? "Dark theme" : "Light theme" }),
        ),
      ).toBeGreaterThanOrEqual(3);
      const themeButton = page.getByRole("button", {
        name: theme === "dark" ? "Dark theme" : "Light theme",
      });
      await themeButton.focus();
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof HTMLElement)) return null;
        const styles = getComputedStyle(element);
        return {
          style: styles.outlineStyle,
          width: styles.outlineWidth,
          color: styles.outlineColor,
        };
      });
      expect(focus?.style).toBe("solid");
      expect(focus?.width).not.toBe("0px");
      expect(focus?.color).not.toBe("transparent");
      await expectNoPageHorizontalScroll(page);
    }

    expect(await readProgression(page)).toEqual(progressionBeforePlayback);
    expect(await page.locator('[data-testid^="chord-card-"]').count()).toBeGreaterThan(0);
  });

  test("applies Escape priority, outside dismissal, and focus restoration to menus and dialogs", async ({
    page,
  }) => {
    await waitForStudio(page);

    const projectToggle = page.getByTestId("project-menu-toggle");
    await projectToggle.click();
    await expect(page.getByRole("menu", { name: "Project actions" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "Project actions" })).not.toBeVisible();
    await expect(projectToggle).toBeFocused();

    await projectToggle.click();
    await page
      .getByRole("region", { name: "Harmonic Matrix" })
      .locator(".matrix-toolbar")
      .click({ position: { x: 8, y: 8 } });
    await expect(page.getByRole("menu", { name: "Project actions" })).not.toBeVisible();

    const resetSummary = page.locator(".matrix-reset-menu summary");
    await resetSummary.click();
    await expect(page.getByRole("button", { name: "Reset Current Module" })).toBeVisible();
    await resetSummary.focus();
    await page.keyboard.press("Escape");
    await expect(page.locator(".matrix-reset-menu")).not.toHaveAttribute("open", "");
    await expect(page.getByRole("button", { name: "Reset Current Module" })).not.toBeVisible();
    await expect(resetSummary).toBeFocused();

    await projectToggle.click();
    await page.getByTestId("rename-project-btn").click();
    const projectDialog = page.getByRole("dialog", { name: "Rename Project" });
    await expect(projectDialog).toBeVisible();
    await expect(page.getByTestId("project-name-input")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(projectDialog).not.toBeVisible();
    await expect(projectToggle).toBeFocused();

    await projectToggle.click();
    await page.getByTestId("new-project-btn").click();
    await expect(page.getByRole("dialog", { name: "New Project" })).toBeVisible();
    await page.locator(".dialog-backdrop").click({ position: { x: 2, y: 2 } });
    await expect(page.getByRole("dialog", { name: "New Project" })).not.toBeVisible();
  });

  test("keeps reduced-motion and zoom stress usable while icon controls remain named", async ({
    page,
  }) => {
    test.slow();
    await waitForStudio(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const motion = await page.getByTestId("project-menu-toggle").evaluate((element) => {
      const styles = getComputedStyle(element);
      return { transition: styles.transitionDuration, animation: styles.animationDuration };
    });
    expect(Number.parseFloat(motion.transition)).toBeLessThanOrEqual(0.001);
    expect(Number.parseFloat(motion.animation)).toBeLessThanOrEqual(0.001);

    const unnamedIconButtons = await page.locator("button:has(.ui-icon)").evaluateAll((buttons) =>
      buttons
        .filter((button) => {
          const text = button.textContent?.trim() ?? "";
          return !text && !button.getAttribute("aria-label") && !button.getAttribute("title");
        })
        .map((button) => button.outerHTML),
    );
    expect(unnamedIconButtons).toEqual([]);

    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => {
        document.documentElement.style.zoom = "1.5";
      });
      await expectNoPageHorizontalScroll(page);
      await page.evaluate(() => {
        document.documentElement.style.zoom = "";
      });
      await expectNoPageHorizontalScroll(page);
    }
  });
});
