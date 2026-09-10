import { expect, test } from "@playwright/test";

test.describe("Piano Card View — chord-tone keyboard contract", () => {
  test("renders real key geometry and excludes Matrix bass from Piano markers", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Harmonic Matrix" })).toBeVisible();

    await page.getByLabel("Global Card View").selectOption("piano");
    const matrixPiano = page.getByTestId("chord-card-I").locator(".mini-piano");
    await expect(matrixPiano).toBeVisible();
    await expect(page.getByTestId("chord-card-I").locator(".mini-piano-chord-name")).toHaveText(
      "C",
    );
    await expect(page.getByTestId("chord-card-I").locator(".mini-piano-octave")).toHaveText(
      "Oct 4",
    );
    await expect(
      page.getByTestId("chord-card-I").locator(".mini-piano-white-key-label.is-active"),
    ).toHaveText(["C", "E", "G"]);
    await expect(
      page.getByTestId("chord-card-I").locator(".mini-piano-white-key-label:not(.is-active)"),
    ).toHaveText(["", "", "", ""]);
    await expect(matrixPiano.locator(".mini-white-key")).toHaveCount(7);
    await expect(matrixPiano.locator(".mini-black-key")).toHaveCount(5);
    await expect(matrixPiano.locator('.mini-key[data-midi="48"][data-active="true"]')).toHaveCount(
      0,
    );
    await expect(matrixPiano.locator('.mini-key[data-midi="60"][data-active="true"]')).toHaveCount(
      1,
    );
    await expect(matrixPiano).toHaveAttribute("aria-label", /C chord on piano:/);
    await expect(matrixPiano.locator('.mini-key[data-pressed="true"]')).toHaveCount(3);

    const geometry = await matrixPiano.evaluate((piano) => {
      const frame = piano.getBoundingClientRect();
      const white = piano.querySelector(".mini-white-key")!.getBoundingClientRect();
      const black = piano.querySelector(".mini-black-key")!.getBoundingClientRect();
      return {
        aspectRatio: frame.width / frame.height,
        blackHeightRatio: black.height / white.height,
      };
    });
    expect(geometry.aspectRatio).toBeGreaterThan(1.9);
    expect(geometry.aspectRatio).toBeLessThan(2.2);
    expect(geometry.blackHeightRatio).toBeGreaterThan(0.54);
    expect(geometry.blackHeightRatio).toBeLessThan(0.62);

    const clippedBlackKeys = await matrixPiano.locator(".mini-black-key").evaluateAll((keys) => {
      const frame = keys[0]?.closest(".mini-piano")?.getBoundingClientRect();
      if (!frame) return keys.length;
      return keys.filter((key) => {
        const bounds = key.getBoundingClientRect();
        return bounds.left <= frame.left || bounds.right >= frame.right;
      }).length;
    });
    expect(clippedBlackKeys).toBe(0);

    for (const theme of ["dark", "light"] as const) {
      await page
        .getByRole("button", { name: `${theme === "dark" ? "Dark" : "Light"} theme` })
        .click();
      const colors = await matrixPiano.evaluate((piano) => ({
        white: getComputedStyle(piano.querySelector(".mini-white-key:not(.is-pressed)")!)
          .backgroundColor,
        black: getComputedStyle(piano.querySelector(".mini-black-key:not(.is-pressed)")!)
          .backgroundColor,
      }));
      expect(colors.white).toBe("rgb(255, 255, 255)");
      expect(colors.black).toBe("rgb(48, 53, 60)");
    }

    await page
      .getByTestId("chord-card-I")
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
    await page.getByLabel("Progression Card View").selectOption("piano");
    const progressionPiano = page
      .locator('[data-testid="progression-step"]')
      .first()
      .locator(".mini-piano");
    await expect(progressionPiano).toBeVisible();
    await expect(progressionPiano.locator('.mini-key[data-active="true"]')).not.toHaveCount(0);
    await expect(progressionPiano.locator('[data-channel-role="bass"]')).toHaveCount(0);
  });

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    test(`does not overflow the card at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.getByLabel("Global Card View").selectOption("piano");
      await expect(page.getByTestId("chord-card-I").locator(".mini-piano")).toBeVisible();

      const overflow = await page.evaluate(() => ({
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        innerWidth: window.innerWidth,
        scrollX: window.scrollX,
      }));
      expect(overflow.documentScrollWidth).toBeLessThanOrEqual(overflow.documentClientWidth);
      expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
      expect(overflow.scrollX).toBe(0);
    });
  }
});
