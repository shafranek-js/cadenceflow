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
    type Rgba = [number, number, number, number];
    const parse = (value: string): Rgba => {
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) throw new Error(`Expected computed RGB color, received ${value}`);
      const alpha = value.startsWith("rgba")
        ? Number(value.match(/,\s*([\d.]+)\s*\)$/)?.[1] ?? "1")
        : 1;
      return [Number(match[1]), Number(match[2]), Number(match[3]), alpha];
    };
    const blend = (foreground: Rgba, background: Rgba): Rgba => {
      const alpha = foreground[3] + background[3] * (1 - foreground[3]);
      return [
        (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) /
          alpha,
        (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) /
          alpha,
        (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) /
          alpha,
        alpha,
      ];
    };
    const effectiveBackground = (target: Element): Rgba => {
      const layers: Rgba[] = [];
      for (let current: Element | null = target; current; current = current.parentElement) {
        layers.push(parse(getComputedStyle(current).backgroundColor));
      }
      return layers
        .reverse()
        .reduce((background, layer) => blend(layer, background), [255, 255, 255, 1] as Rgba);
    };
    const luminance = ([red, green, blue]: Rgba) =>
      [red, green, blue]
        .map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
    const styles = getComputedStyle(element);
    const effectiveBackgroundColor = effectiveBackground(element);
    const foreground = luminance(blend(parse(styles.color), effectiveBackgroundColor));
    const background = luminance(effectiveBackgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
}

test.describe("US10 Batch B — accessible studio interaction", () => {
  test("supports Tab, Enter, Space, settings/reset, and keyboard progression reorder", async ({
    page,
  }) => {
    test.slow();
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
    const middleStepSelect = middleStep.getByRole("button", {
      name: /Select progression step IV/,
    });
    await middleStepSelect.focus();
    await page.keyboard.press("Enter");
    await expect(middleStep).toHaveAttribute("data-selected", "true");
    await expect(middleStepSelect).toHaveAttribute("aria-pressed", "true");

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

    expect(await middleStep.getAttribute("role")).toBeNull();
    expect(await middleStep.getAttribute("tabindex")).toBeNull();
    await page.getByRole("button", { name: "Add Rest to progression" }).click();
    const restStep = page.locator('[data-testid="progression-step"]').last();
    const restStepSelect = restStep.getByRole("button", {
      name: "Select progression rest step",
      exact: true,
    });
    await restStepSelect.focus();
    await page.keyboard.press("Space");
    await expect(restStepSelect).toHaveAttribute("aria-pressed", "true");
    expect(await restStep.getAttribute("role")).toBeNull();
    expect(await restStep.getAttribute("tabindex")).toBeNull();
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

    const lightTheme = page.getByRole("button", { name: "Light theme" });
    await lightTheme.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const beginnerMode = page.getByRole("button", { name: "Beginner expertise mode" });
    await beginnerMode.focus();
    await page.keyboard.press("Space");
    const expertMode = page.getByRole("button", { name: "Expert expertise mode" });
    await expertMode.focus();
    await page.keyboard.press("Enter");
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
    test.slow();
    await waitForStudio(page);
    await page.getByRole("button", { name: "Add bIII to progression" }).click();
    await page
      .locator('[data-testid="progression-step"]')
      .last()
      .getByRole("button", { name: /Select progression step bIII/ })
      .click();
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
    const loopAll = page.getByRole("button", { name: "All", exact: true });
    await loopAll.focus();
    await page.keyboard.press("Enter");
    await expect(loopAll).toHaveAttribute("aria-pressed", "true");
    await play.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("transport-status")).toContainText("Playing");
    await pause.focus();
    await page.keyboard.press("Space");
    await expect(page.getByTestId("transport-status")).toContainText("Paused");
    await resume.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("transport-status")).toContainText("Playing");
    await stop.focus();
    await page.keyboard.press("Space");
    await expect(page.getByTestId("transport-status")).toContainText("Stopped");

    const swing = page.getByRole("button", { name: "Toggle Swing Feel" });
    await swing.focus();
    await page.keyboard.press("Enter");
    await expect(swing).toHaveAttribute("aria-pressed", "true");
    const metronome = page.getByRole("button", { name: "Toggle Metronome" });
    await metronome.focus();
    await page.keyboard.press("Space");
    await expect(metronome).toHaveAttribute("aria-pressed", "true");

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
      const selectedPolicyContrast = await contrastRatio(
        page,
        page.locator(".meter-policy-toggle .policy-option.is-selected"),
      );
      const activeVelocityViewContrast = await contrastRatio(
        page,
        page.locator(".view-preference-toggle button.is-active"),
      );
      const activeLoopContrast = await contrastRatio(
        page,
        page.locator(".loop-mode-btn.is-active"),
      );
      const activeGrooveContrast = await contrastRatio(
        page,
        page.locator(".groove-toggle-btn.is-active"),
      );
      const activeTransportToggleContrast = await contrastRatio(
        page,
        page.locator(".transport-toggle-button.is-active").first(),
      );
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
      return {
        controlContrast,
        bodyContrast,
        selectedPolicyContrast,
        activeVelocityViewContrast,
        activeLoopContrast,
        activeGrooveContrast,
        activeTransportToggleContrast,
        focusEvidence,
      };
    };

    for (const theme of ["dark", "light"] as const) {
      const evidence = await readThemeEvidence(theme);
      expect(evidence.controlContrast).toBeGreaterThanOrEqual(3);
      expect(evidence.bodyContrast).toBeGreaterThanOrEqual(4.5);
      expect(evidence.selectedPolicyContrast).toBeGreaterThanOrEqual(4.5);
      expect(evidence.activeVelocityViewContrast).toBeGreaterThanOrEqual(4.5);
      expect(evidence.activeLoopContrast).toBeGreaterThanOrEqual(4.5);
      expect(evidence.activeGrooveContrast).toBeGreaterThanOrEqual(4.5);
      expect(evidence.activeTransportToggleContrast).toBeGreaterThanOrEqual(4.5);
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
