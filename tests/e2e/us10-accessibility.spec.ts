import { expect, test, type Locator, type Page } from "@playwright/test";
import { ensureHistoryControlsVisible } from "./test-helpers/global-settings";
import {
  addRestToProgression,
  setProgressionView,
  startBranchAlternative,
} from "./test-helpers/progression-settings";

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
    .locator(".measure-staff-event-select")
    .evaluateAll((steps) => steps.map((step) => step.getAttribute("data-step-id") ?? ""));
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
  test("exposes the current Studio landmarks and Staff score surface", async ({ page }) => {
    await waitForStudio(page);

    await expect(page.getByRole("main", { name: "CadenceFlow Studio" })).toHaveCount(1);
    await expect(
      page.locator('header.app-header[aria-label="Project and application controls"]'),
    ).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Studio work area" })).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Harmonic Matrix" })).toHaveCount(1);
    await expect(page.getByRole("complementary", { name: "Inspector" })).toHaveCount(1);
    await expect(page.getByRole("region", { name: "My Progression" })).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Playback Transport" })).toHaveCount(1);
    await expect(page.getByRole("contentinfo", { name: "Status bar" })).toHaveCount(1);

    await page
      .getByTestId("chord-card-I")
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
    await setProgressionView(page, "staff");
    await expect(page.getByTestId("progression-score-systems")).toHaveAttribute(
      "aria-label",
      /^Staff score systems; /,
    );
    await expect(
      page.getByTestId("progression-score-systems").locator(".measure-staff-event-select"),
    ).toHaveCount(1);
  });

  test("supports Tab, Enter, Space, template reset, and keyboard progression reorder", async ({
    page,
  }) => {
    test.slow();
    await waitForStudio(page);
    await setProgressionView(page, "staff");

    const matrixCard = page.getByTestId("chord-card-I");
    const previewButton = matrixCard.getByRole("button", { name: /Preview I/ });
    await previewButton.focus();
    await page.keyboard.press("Enter");
    await expect(matrixCard).toHaveClass(/is-selected/);
    await previewButton.focus();
    await page.keyboard.press("Space");
    await expect(matrixCard).toHaveClass(/is-selected/);

    const steps = page.locator(".measure-staff-event-select");
    const beforeAdd = await steps.count();
    const chordMain = matrixCard.locator(".chord-main");
    await chordMain.focus();
    await page.keyboard.press("Enter");
    await expect(steps).toHaveCount(beforeAdd);
    await chordMain.click({ modifiers: ["Control"] });
    await expect(steps).toHaveCount(beforeAdd + 1);

    await chordMain.click();
    const template = page.getByRole("region", { name: "Template settings for I" });
    await expect(template).toBeVisible();
    const articulation = template.getByRole("button", { name: "Articulation: Arp Up" });
    await articulation.focus();
    await page.keyboard.press("Enter");
    const resetButton = template.getByRole("button", { name: "Reset Card to Defaults" });
    await expect(resetButton).toBeEnabled();
    await resetButton.focus();
    await page.keyboard.press("Enter");
    await expect(template).toContainText("Inheriting defaults");

    for (const functionId of ["IV", "V"]) {
      await page
        .getByTestId(`chord-card-${functionId}`)
        .locator(".chord-main")
        .click({ modifiers: ["Control"] });
    }
    await expect(steps).toHaveCount(beforeAdd + 3);
    const identityBeforeReorder = await readProgressionIdentity(page);
    const middleStep = steps.nth(1);
    const middleStepId = await middleStep.getAttribute("data-step-id");
    expect(middleStepId).toBeTruthy();
    const middleStepSelect = middleStep;
    await middleStepSelect.focus();
    await page.keyboard.press("Enter");
    await expect(middleStep).toHaveAttribute("aria-pressed", "true");
    await expect(middleStepSelect).toHaveAttribute("aria-pressed", "true");

    const moveLeft = page.getByRole("button", { name: "Move step left" });
    await moveLeft.focus();
    await page.keyboard.press("Enter");
    await expect(steps.nth(0)).toHaveAttribute("data-step-id", middleStepId!);
    await expect(steps.nth(0)).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.activeElement?.closest<HTMLElement>("[data-progression-step-select]")?.dataset
              .stepId,
        ),
      )
      .toBe(middleStepId);

    const moveRight = page.getByRole("button", { name: "Move step right" });
    await moveRight.focus();
    await page.keyboard.press("Enter");
    await expect(steps.nth(1)).toHaveAttribute("data-step-id", middleStepId!);
    await expect(steps.nth(1)).toHaveAttribute("aria-pressed", "true");
    expect(await readProgressionIdentity(page)).toEqual(identityBeforeReorder);

    await addRestToProgression(page);
    const restStepSelect = page
      .locator(".measure-staff-event.is-rest .measure-staff-event-select")
      .last();
    await expect(restStepSelect).toHaveAttribute("aria-label", /Select Rest/);
    const restStepId = await restStepSelect.getAttribute("data-step-id");
    expect(restStepId).toBeTruthy();
    const selectedBeforeRest = await restStepSelect.getAttribute("aria-pressed");
    expect(selectedBeforeRest).toBe("false");
    await restStepSelect.focus();
    await page.keyboard.press("Space");
    await expect(restStepSelect).toHaveAttribute("aria-pressed", "true");
    const restStepEvent = restStepSelect.locator("..");
    expect(await restStepEvent.getAttribute("role")).toBeNull();
    expect(await restStepEvent.getAttribute("tabindex")).toBeNull();
  });

  test("keeps global Matrix and Progression views keyboard-accessible without per-card controls", async ({
    page,
  }) => {
    await waitForStudio(page);
    const card = page.getByTestId("chord-card-I");
    const globalView = page.getByLabel("Global Card View");
    await globalView.focus();
    await globalView.selectOption("piano");
    await expect(globalView).toHaveValue("piano");
    await expect(globalView).toBeFocused();
    await expect(card.locator(".mini-piano")).toBeVisible();

    await globalView.selectOption("staff");
    await expect(globalView).toHaveValue("staff");
    await expect(globalView).toBeFocused();
    await expect(card.locator(".mini-staff")).toBeVisible();
    await expect(card.getByRole("group", { name: "View for I" })).toHaveCount(0);

    await page
      .getByTestId("chord-card-I")
      .locator(".chord-main")
      .click({
        modifiers: ["Control"],
      });
    const progressionView = page.getByTestId("progression-view-btn-staff");
    await setProgressionView(page, "staff", "keyboard");
    await expect(progressionView).toBeFocused();
    await expect(
      page.getByTestId("progression-score-systems").locator(".measure-staff-event-select").first(),
    ).toBeVisible();
    await expect(page.locator('[data-view="staff"] [data-testid="progression-step"]')).toHaveCount(
      0,
    );
  });

  test("persists theme and expertise choices while preserving progression and Matrix identity", async ({
    page,
  }) => {
    await waitForStudio(page);
    await ensureHistoryControlsVisible(page);
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    await expect(undo).toBeDisabled();

    const activeTheme = page.getByRole("button", { name: "Dark theme" });
    await activeTheme.focus();
    await page.keyboard.press("Enter");
    const activeExpertise = page.getByRole("button", { name: "Composer expertise mode" });
    await activeExpertise.focus();
    await page.keyboard.press("Space");
    await expect(undo).toBeDisabled();

    await page
      .getByTestId("chord-card-I")
      .locator(".chord-main")
      .click({
        modifiers: ["Control"],
      });
    await page
      .getByTestId("chord-card-V")
      .locator(".chord-main")
      .click({
        modifiers: ["Control"],
      });
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
    await setProgressionView(page, "staff");
    await page
      .getByTestId("chord-card-bIII")
      .locator(".chord-main")
      .click({
        modifiers: ["Control"],
      });
    await page.locator(".measure-staff-event-select").last().click();
    await page
      .getByTestId("chord-card-I")
      .getByRole("button", { name: /Preview I/ })
      .click();
    await expect(page.locator(".recommendation-best-badge").first()).toContainText("Best Match");
    await expect(page.locator(".recommendation-alternative-badge").first()).toContainText(
      "Alternative",
    );
    await page.getByTestId("chord-card-bIII").locator(".chord-main").click();
    const template = page.getByRole("region", { name: "Template settings for bIII" });
    const articulation = template.getByRole("button", { name: "Articulation: Arp Up" });
    await articulation.focus();
    await page.keyboard.press("Enter");
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
    const loopToggle = page.getByRole("button", { name: "Toggle Loop", exact: true });
    await loopToggle.focus();
    await page.keyboard.press("Enter");
    await expect(loopToggle).toHaveAttribute("aria-pressed", "true");
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

    const selectedInspector = page.getByTestId("step-performance-inspector");
    const progressionSettings = selectedInspector.getByTestId("selected-progression-settings");
    if (!(await progressionSettings.evaluate((element) => (element as HTMLDetailsElement).open))) {
      await progressionSettings.locator(":scope > summary").click();
    }
    const swing = progressionSettings.getByRole("button", { name: "Toggle Swing Feel" });
    await swing.focus();
    await page.keyboard.press("Enter");
    await expect(swing).toHaveAttribute("aria-pressed", "true");
    const metronome = page.getByRole("button", { name: "Toggle Metronome" });
    await metronome.focus();
    await page.keyboard.press("Space");
    await expect(metronome).toHaveAttribute("aria-pressed", "true");

    await expect(page.getByText("What-if branch active", { exact: true })).not.toBeVisible();
    await startBranchAlternative(page);
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
        page.getByRole("button", { name: "Musical view" }),
      );
      const activeLoopContrast = await contrastRatio(
        page,
        page.locator(".loop-toggle-btn.is-active"),
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
