import { expect, test, type Page } from "@playwright/test";

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
}

test.describe("Harmonic Matrix Header Context Menu", () => {
  test("opens on right click, displays sections, handles submenus, toggles and keyboard escape", async ({
    page,
  }) => {
    await waitForStudio(page);

    // Right-click on matrix-toolbar
    const matrixToolbar = page.locator(".matrix-toolbar");
    await expect(matrixToolbar).toBeVisible();
    await matrixToolbar.click({ button: "right" });

    // Verify context menu is visible
    const contextMenu = page.getByTestId("matrix-context-menu");
    await expect(contextMenu).toBeVisible();
    await expect(contextMenu.getByText("Harmonic Matrix")).toBeVisible();

    // Verify groups and items exist
    await expect(page.getByTestId("matrix-menu-reset-current-module")).toBeVisible();
    await expect(page.getByTestId("matrix-menu-reset-all-modules")).toBeVisible();
    await expect(page.getByTestId("matrix-menu-reset-template-defaults")).toBeVisible();
    await expect(page.getByTestId("matrix-menu-open-transpose")).toBeVisible();
    await expect(page.getByTestId("matrix-menu-open-module")).toBeVisible();
    await expect(page.getByTestId("matrix-menu-open-view")).toBeVisible();
    await expect(page.getByTestId("matrix-menu-toggle-bass")).toBeVisible();
    await expect(page.getByTestId("matrix-menu-open-articulation")).toBeVisible();
    await expect(page.getByTestId("matrix-menu-open-register")).toBeVisible();

    // Open Transpose submenu
    await page.getByTestId("matrix-menu-open-transpose").click();
    const transposeSubmenu = page.getByTestId("matrix-submenu-transpose");
    await expect(transposeSubmenu).toBeVisible();
    await expect(page.getByTestId("matrix-menu-transpose-up")).toBeVisible();

    // Capture screenshot of open matrix context menu with submenu
    await page.screenshot({
      path: "C:/Users/pavel/.gemini/antigravity/brain/b7baeb67-2bbc-4d13-8a03-ad5f1ee7da84/matrix-header-context-menu.png",
    });

    // Close on Escape
    await page.keyboard.press("Escape");
    await expect(transposeSubmenu).not.toBeVisible();
    await expect(contextMenu).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(contextMenu).not.toBeVisible();

    // Reopen menu and test Transpose action
    await matrixToolbar.click({ button: "right" });
    await expect(contextMenu).toBeVisible();
    await page.getByTestId("matrix-menu-open-transpose").click();
    await page.getByTestId("matrix-menu-transpose-up").click();

    // Menu should close on action
    await expect(contextMenu).not.toBeVisible();

    // Reopen and check that key changed (C -> C# or similar)
    await matrixToolbar.click({ button: "right" });
    await expect(contextMenu).toBeVisible();
    await page.getByTestId("matrix-menu-open-transpose").click();
    // Checkmark should be on pitch class 1 (C# / Db)
    const tonic1 = page.getByTestId("matrix-menu-tonic-1");
    await expect(tonic1.locator(".score-system-menu-check")).toBeVisible();

    // Close menu
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(contextMenu).not.toBeVisible();

    // Reopen menu and test Card View Mode
    await matrixToolbar.click({ button: "right" });
    await expect(contextMenu).toBeVisible();
    await page.getByTestId("matrix-menu-open-view").click();
    const viewSubmenu = page.getByTestId("matrix-submenu-view");
    await expect(viewSubmenu).toBeVisible();
    await page.getByTestId("matrix-menu-view-piano").click();
    await expect(contextMenu).not.toBeVisible();

    // Check that Piano view is active
    await matrixToolbar.click({ button: "right" });
    await page.getByTestId("matrix-menu-open-view").click();
    await expect(page.getByTestId("matrix-menu-view-piano").locator(".score-system-menu-check")).toBeVisible();
    await page.keyboard.press("Escape");

    // Toggle Show Bass in Staff
    await page.getByTestId("matrix-menu-toggle-bass").click();
    await expect(contextMenu).not.toBeVisible();

    // Reopen and verify checkmark on Show Bass in Staff
    await matrixToolbar.click({ button: "right" });
    await expect(page.getByTestId("matrix-menu-toggle-bass").locator(".score-system-menu-check")).toBeVisible();
    await page.keyboard.press("Escape");
  });
});
