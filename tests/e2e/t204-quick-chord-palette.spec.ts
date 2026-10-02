import { expect, test } from "@playwright/test";
import { ensureHistoryControlsVisible } from "./test-helpers/global-settings";

test.describe("T204 Quick Chord / Command Palette", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("pointer preview and Escape cancel are non-mutating and restore the Matrix trigger focus", async ({
    page,
  }) => {
    await page.goto("/");
    const trigger = page.getByTestId("matrix-quick-chord-trigger");

    await trigger.click();
    await expect(page.getByTestId("quick-chord-palette")).toBeVisible();
    const search = page.getByTestId("quick-chord-palette-search");
    await search.fill("V7/V");
    await search.press("Control+k");
    await expect(page.getByTestId("quick-chord-palette")).toBeVisible();
    await expect(search).toHaveValue("V7/V");
    const result = page.getByTestId("quick-chord-candidate-V7-V");
    await expect(result).toBeVisible();

    await result.click();
    await expect(page.getByTestId("chord-card-V7/V")).toHaveClass(/is-selected/);
    await expect(page.getByTestId("progression-step")).toHaveCount(0);
    await page.getByTestId("quick-chord-palette-cancel").click();
    await expect(page.getByTestId("quick-chord-palette")).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.getByTestId("quick-chord-palette-search").fill("V7/V");
    await page.getByTestId("quick-chord-candidate-V7-V").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("quick-chord-palette")).toHaveCount(0);
    await expect(page.getByTestId("progression-step")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("Ctrl/Cmd+K and Enter Apply add one Step through one history entry with Undo/Redo", async ({
    page,
  }) => {
    await page.goto("/");
    await ensureHistoryControlsVisible(page);

    await page.keyboard.press("Control+k");
    await expect(page.getByTestId("quick-chord-palette")).toBeVisible();
    const search = page.getByTestId("quick-chord-palette-search");
    await expect(search).toBeFocused();
    await search.fill("V7/V");
    await search.press("Enter");

    await expect(page.getByTestId("quick-chord-palette")).toHaveCount(0);
    await expect(page.getByTestId("progression-step")).toHaveCount(1);
    const applied = await page.getByTestId("progression-step").innerText();
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const redo = page.getByRole("button", { name: "Redo", exact: true });
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect(page.getByTestId("progression-step")).toHaveCount(0);
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect(page.getByTestId("progression-step")).toHaveCount(1);
    await expect(page.getByTestId("progression-step")).toContainText("V7/V");
    expect(await page.getByTestId("progression-step").innerText()).toBe(applied);
  });

  test("uses the committed endpoint after a preview and preserves strict warning/Add anyway semantics", async ({
    page,
  }) => {
    await page.goto("/");
    await ensureHistoryControlsVisible(page);
    await page
      .getByTestId("chord-card-V7/vi")
      .locator(".chord-main")
      .click({
        modifiers: ["Control"],
      });
    await expect(page.getByTestId("progression-step")).toHaveCount(1);

    await page.getByTestId("matrix-quick-chord-trigger").click();
    const search = page.getByTestId("quick-chord-palette-search");
    await search.fill("V7/V");
    await page.getByTestId("quick-chord-candidate-V7-V").click();
    await expect(page.getByTestId("chord-card-V7/V")).toHaveClass(/is-selected/);

    const apply = page.getByTestId("quick-chord-apply-V7-V");
    await apply.click();
    await expect(page.getByRole("dialog", { name: "Confirm harmonic route" })).toBeVisible();
    await expect(page.getByTestId("route-warning-message")).toContainText("vi");
    await expect(page.getByTestId("progression-step")).toHaveCount(1);

    // Ctrl/Cmd+K is inert while a dialog owns focus.
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Confirm harmonic route" })).toBeVisible();
    await page
      .getByRole("dialog", { name: "Confirm harmonic route" })
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(page.getByRole("dialog", { name: "Confirm harmonic route" })).toHaveCount(0);
    await expect(page.getByTestId("quick-chord-palette")).toBeVisible();

    await apply.click();
    await page.getByTestId("route-add-anyway").click();
    await expect(page.getByTestId("quick-chord-palette")).toHaveCount(0);
    await expect(page.getByTestId("progression-step")).toHaveCount(2);

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByTestId("progression-step")).toHaveCount(1);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.getByTestId("progression-step")).toHaveCount(2);
  });

  test("keeps results scrollable and Cancel visible under 200% layout pressure", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto("/");
    await page.getByTestId("matrix-quick-chord-trigger").click();
    const cancel = page.getByTestId("quick-chord-palette-cancel");
    await expect(cancel).toBeInViewport();
    await expect(page.getByTestId("quick-chord-palette-search")).toBeInViewport();
    await expect(
      page.getByTestId("quick-chord-result").first().getByRole("button", { name: /Apply/ }),
    ).toBeInViewport();
    await cancel.click();
    await expect(page.getByTestId("quick-chord-palette")).toHaveCount(0);
  });
});
