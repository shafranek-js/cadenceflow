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

async function readProgressionIdentity(page: Page): Promise<string[]> {
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
    const luminance = ([red, green, blue]: [number, number, number]) =>
      [red, green, blue]
        .map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
    const styles = getComputedStyle(element);
    const foreground = luminance(parse(styles.color));
    const background = luminance(parse(styles.backgroundColor));
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
}

test.describe("US10 Batch B — accessible studio interaction", () => {
  test("supports Tab, Enter, Space, settings/reset, and keyboard progression reorder", async ({
    page,
  }) => {
    await waitForStudio(page);

    const matrixCard = page.getByTestId("chord-card-I");
    const previewButton = matrixCard.getByRole("button", { name: /Preview I/ });
    await previewButton.focus();
    await page.keyboard.press("Enter");
    await expect(matrixCard).toHaveClass(/is-selected/);
    await previewButton.focus();
    await page.keyboard.press("Space");
    await expect(matrixCard).toHaveClass(/is-selected/);

    const steps = page.locator('[data-testid="progression-step"]');
    const beforeAdd = await steps.count();
    const addButton = matrixCard.getByRole("button", { name: "Add I to progression" });
    await addButton.focus();
    await page.keyboard.press("Enter");
    await expect(steps).toHaveCount(beforeAdd + 1);

    const settingsButton = matrixCard.getByRole("button", { name: "Settings for I" });
    await settingsButton.focus();
    await page.keyboard.press("Enter");
    const template = page.getByRole("region", { name: "Template settings for I" });
    await expect(template).toBeVisible();
    await template.getByRole("combobox").first().selectOption("arp-up");
    const resetButton = template.getByRole("button", { name: "Reset Card to Defaults" });
    await expect(resetButton).toBeEnabled();
    await resetButton.focus();
    await page.keyboard.press("Enter");
    await expect(template).toContainText("Inheriting defaults");

    for (const functionId of ["IV", "V"]) {
      await page
        .getByTestId(`chord-card-${functionId}`)
        .getByRole("button", { name: new RegExp(`Add ${functionId} to progression`) })
        .click();
    }
    await expect(steps).toHaveCount(beforeAdd + 3);
    const identityBeforeReorder = await readProgressionIdentity(page);
    const middleStep = steps.nth(1);
    await middleStep.focus();
    await page.keyboard.press("Enter");
    await expect(middleStep).toHaveAttribute("data-selected", "true");

    const moveLeft = page.getByRole("button", { name: "Move step left" });
    await moveLeft.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="progression-step"]').nth(0)).toHaveAttribute(
      "data-selected",
      "true",
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement?.closest('[data-testid="progression-step"]')?.textContent,
        ),
      )
      .toContain("IV");

    const moveRight = page.getByRole("button", { name: "Move step right" });
    await moveRight.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="progression-step"]').nth(1)).toHaveAttribute(
      "data-selected",
      "true",
    );
    await expect(page.locator('[data-testid="progression-step"]').nth(1)).toContainText("IV");
    expect(await readProgressionIdentity(page)).toEqual(identityBeforeReorder);
  });

  test("keeps global and per-card views keyboard-accessible with focus preservation", async ({
    page,
  }) => {
    await waitForStudio(page);
    const card = page.getByTestId("chord-card-I");
    const globalView = page.getByLabel("Global Card View");
    await globalView.focus();
    await globalView.selectOption("piano");
    await expect(globalView).toHaveValue("piano");
    await expect(globalView).toBeFocused();

    const switcher = card.getByRole("group", { name: "View for I" });
    const staffButton = switcher.getByRole("button", { name: "staff", exact: true });
    await staffButton.focus();
    await page.keyboard.press("Enter");
    await expect(staffButton).toHaveAttribute("aria-pressed", "true");
    await expect(staffButton).toBeFocused();

    await page.getByRole("button", { name: "Add I to progression" }).click();
    const progressionView = page.getByLabel("Progression Card View");
    await progressionView.focus();
    await progressionView.selectOption("staff");
    await expect(progressionView).toHaveValue("staff");
    await expect(progressionView).toBeFocused();

    const progressionStepView = page
      .locator('[data-testid="progression-step"]')
      .first()
      .getByRole("group", { name: /View for progression step/ });
    const progressionPianoButton = progressionStepView.getByRole("button", {
      name: "piano",
      exact: true,
    });
    await progressionPianoButton.focus();
    await page.keyboard.press("Enter");
    await expect(progressionPianoButton).toHaveAttribute("aria-pressed", "true");
    await expect(progressionPianoButton).toBeFocused();
  });

  test("persists theme and expertise choices while preserving progression and Matrix identity", async ({
    page,
  }) => {
    await waitForStudio(page);
    await page.getByRole("button", { name: "Add I to progression" }).click();
    await page.getByRole("button", { name: "Add V to progression" }).click();
    const progressionBefore = await readProgressionIdentity(page);
    const matrixIdsBefore = await page
      .locator('[data-testid^="chord-card-"]')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-testid")));

    await page.getByRole("button", { name: "Light theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "Beginner expertise mode" }).click();
    await page.getByRole("button", { name: "Expert expertise mode" }).click();
    await expect(page.getByRole("button", { name: "Expert expertise mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const matrixIdsExpert = await page
      .locator('[data-testid^="chord-card-"]')
      .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-testid")));
    expect(matrixIdsExpert).toEqual(matrixIdsBefore);
    expect(await readProgressionIdentity(page)).toEqual(progressionBefore);
    await expectNoPageHorizontalScroll(page);
    await page.waitForTimeout(450);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("button", { name: "Expert expertise mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(await readProgressionIdentity(page)).toEqual(progressionBefore);

    for (const mode of ["Beginner", "Composer", "Expert"]) {
      await page.getByRole("button", { name: `${mode} expertise mode` }).click();
      expect(
        await page
          .locator('[data-testid^="chord-card-"]')
          .evaluateAll((cards) => cards.map((card) => card.getAttribute("data-testid"))),
      ).toEqual(matrixIdsBefore);
    }
  });

  test("covers module dialog lifecycle, transport states, non-color signals, and contrast", async ({
    page,
  }) => {
    await waitForStudio(page);
    await page.getByRole("button", { name: "Add bIII to progression" }).click();
    await page
      .getByTestId("chord-card-I")
      .getByRole("button", { name: /Preview I/ })
      .click();
    await expect(page.locator(".recommendation-best-badge").first()).toContainText("Best Match");
    await expect(page.locator(".recommendation-alternative-badge").first()).toContainText(
      "Alternative",
    );
    await page
      .getByTestId("chord-card-bIII")
      .getByRole("button", { name: "Settings for bIII" })
      .click();
    const template = page.getByRole("region", { name: "Template settings for bIII" });
    await template.getByRole("combobox").first().selectOption("arp-up");
    await expect(page.getByRole("img", { name: /Customized · 1 overrides/ })).toBeVisible();
    const moduleButton = page.getByRole("button", { name: /^Dark Harmony/ });
    await moduleButton.click();
    const dialog = page.getByRole("dialog", { name: "Resolve ambiguous harmony" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("select").first()).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Switch Module" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(moduleButton).toBeFocused();

    await moduleButton.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Switch Module" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(moduleButton).toHaveAttribute("aria-pressed", "true");

    const play = page.getByRole("button", { name: "Play", exact: true });
    const pause = page.getByRole("button", { name: "Pause", exact: true });
    const resume = page.getByRole("button", { name: "Resume", exact: true });
    const stop = page.getByRole("button", { name: "Stop", exact: true });
    await play.click();
    await expect(page.getByTestId("transport-status")).toContainText("Playing");
    await pause.click();
    await expect(page.getByTestId("transport-status")).toContainText("Paused");
    await resume.click();
    await expect(page.getByTestId("transport-status")).toContainText("Playing");
    await stop.click();
    await expect(page.getByTestId("transport-status")).toContainText("Stopped");

    await expect(page.getByText("What-if branch active", { exact: true })).not.toBeVisible();
    await page.getByRole("button", { name: "Explore Alternative" }).click();
    await expect(page.getByText("What-if branch active", { exact: true })).toBeVisible();

    const readThemeEvidence = async (theme: "dark" | "light") => {
      await page
        .getByRole("button", { name: `${theme === "dark" ? "Dark" : "Light"} theme` })
        .click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const controlContrast = await contrastRatio(
        page,
        page.getByRole("button", { name: theme === "dark" ? "Dark theme" : "Light theme" }),
      );
      const bodyContrast = await contrastRatio(page, page.locator("body"));
      const themeButton = page.getByRole("button", {
        name: theme === "dark" ? "Dark theme" : "Light theme",
      });
      await themeButton.focus();
      await page.keyboard.press("Tab");
      const focusEvidence = await page.evaluate(() => {
        const focused = document.activeElement;
        if (!(focused instanceof HTMLElement)) return null;
        const styles = getComputedStyle(focused);
        return {
          outlineStyle: styles.outlineStyle,
          outlineWidth: styles.outlineWidth,
          outlineColor: styles.outlineColor,
        };
      });
      return { controlContrast, bodyContrast, focusEvidence };
    };

    for (const theme of ["dark", "light"] as const) {
      const evidence = await readThemeEvidence(theme);
      expect(evidence.controlContrast).toBeGreaterThanOrEqual(3);
      expect(evidence.bodyContrast).toBeGreaterThanOrEqual(4.5);
      expect(evidence.focusEvidence?.outlineStyle).toBe("solid");
      expect(evidence.focusEvidence?.outlineWidth).not.toBe("0px");
      expect(evidence.focusEvidence?.outlineColor).not.toBe("transparent");
    }
  });
});

test.describe("US10 Batch B — theme layout extremes", () => {
  for (const viewport of [
    { name: "1280x720", width: 1280, height: 720 },
    { name: "1920x1080", width: 1920, height: 1080 },
  ]) {
    test.describe(viewport.name, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height } });

      test("has no page-level horizontal scroll in dark and light themes", async ({ page }) => {
        await waitForStudio(page);
        await expectNoPageHorizontalScroll(page);
        await page.getByRole("button", { name: "Light theme" }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
        await expectNoPageHorizontalScroll(page);
        await page.getByRole("button", { name: "Dark theme" }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        await expectNoPageHorizontalScroll(page);
      });
    });
  }
});
