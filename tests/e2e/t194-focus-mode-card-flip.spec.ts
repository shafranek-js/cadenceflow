import { expect, test } from "@playwright/test";

const acceptanceModes = [
  { width: 1280, height: 720, theme: "light" },
  { width: 1280, height: 720, theme: "dark" },
  { width: 1920, height: 1080, theme: "light" },
  { width: 1920, height: 1080, theme: "dark" },
] as const;

for (const acceptance of acceptanceModes) {
  test(`T194 Focus Mode and Card Flip at ${acceptance.width}x${acceptance.height} ${acceptance.theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: acceptance.width, height: acceptance.height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page
      .getByRole("button", {
        name: acceptance.theme === "light" ? "Light theme" : "Dark theme",
      })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", acceptance.theme);

    const focusToggle = page.getByTestId("matrix-focus-toggle");
    const panel = page.locator(".matrix-panel");
    const harmonicView = page.getByTestId("matrix-view-btn-harmonic");
    const progressionSteps = page.getByTestId("progression-step");
    const initialStepCount = await progressionSteps.count();
    await expect(harmonicView).toHaveAttribute("aria-pressed", "true");

    await focusToggle.focus();
    await page.keyboard.press("Enter");
    await expect(focusToggle).toHaveAttribute("aria-pressed", "true");
    await expect(panel).toHaveAttribute("data-focus-mode", "true");
    await expect(page.locator(".studio-grid > .progression-strip")).toBeHidden();

    const card = page.getByTestId("chord-card-V");
    const cardMain = card.locator(".chord-main");
    await cardMain.focus();
    await page.keyboard.press("Enter");
    await expect(cardMain).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByTestId("matrix-card-focus-details")).toContainText("Tendency:");
    const flip = page.getByTestId("matrix-card-flip-V");
    await flip.focus();
    await page.keyboard.press("Enter");
    await expect(flip).toHaveAttribute("aria-expanded", "true");
    const guitar = card.getByTestId("mini-guitar-card-visual");
    await expect(guitar).toBeVisible();
    const fretCount = await guitar.getAttribute("data-frets");
    expect(fretCount?.trim().split(/\s+/)).toHaveLength(6);
    await expect(guitar).toHaveAttribute("data-base-fret", /\d+/);

    const reducedMotionAndOverflow = await page.evaluate(() => {
      const details = document.querySelector<HTMLElement>(".matrix-card-flip-back");
      return {
        animationDuration: details ? getComputedStyle(details).animationDuration : null,
        pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        panelOverflow: document.querySelector<HTMLElement>(".matrix-panel")
          ? document.querySelector<HTMLElement>(".matrix-panel")!.scrollWidth -
            document.querySelector<HTMLElement>(".matrix-panel")!.clientWidth
          : Number.POSITIVE_INFINITY,
      };
    });
    expect(["0s", "0.001ms", "1e-06s"]).toContain(reducedMotionAndOverflow.animationDuration);
    expect(reducedMotionAndOverflow.pageOverflow).toBeLessThanOrEqual(0);
    expect(reducedMotionAndOverflow.panelOverflow).toBeLessThanOrEqual(0);

    await page.keyboard.press("Escape");
    await expect(focusToggle).toBeFocused();
    await expect(focusToggle).toHaveAttribute("aria-pressed", "false");
    await expect(panel).not.toHaveAttribute("data-focus-mode", "true");
    await expect(page.locator(".studio-grid > .progression-strip")).toBeVisible();
    await expect(cardMain).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("matrix-card-flip-V")).toHaveCount(0);
    await expect(harmonicView).toHaveAttribute("aria-pressed", "true");
    await expect(progressionSteps).toHaveCount(initialStepCount);

    await focusToggle.click();
    await page.getByTestId("matrix-card-flip-V").click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("matrix-focus-toggle")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("matrix-card-flip-V")).toHaveCount(0);
    await expect(page.getByTestId("matrix-view-btn-harmonic")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
}
