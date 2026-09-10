import { expect, test } from "@playwright/test";

test.describe("Application chrome", () => {
  test("provides project tabs, standard menus, and a status bar", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });

    const tabs = page.getByRole("tablist", { name: "Open projects" });
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole("tab")).toHaveCount(1);
    await expect(tabs.getByTestId(/project-tab-close-/)).toHaveCount(1);
    await expect(tabs.getByRole("tab", { name: /Active project:/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const menuBar = page.getByRole("menubar", { name: "Application menu" });
    await expect(menuBar).toBeVisible();
    await expect(page.getByRole("button", { name: "Project", exact: true })).toBeVisible();
    await expect(page.getByTestId("edit-menu-toggle")).toBeVisible();
    await expect(page.getByTestId("view-menu-toggle")).toBeVisible();

    await page.getByTestId("edit-menu-toggle").click();
    await expect(page.getByRole("menu", { name: "Edit menu" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Undo/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("edit-menu-toggle")).toBeFocused();

    await page.getByTestId("view-menu-toggle").click();
    const viewMenu = page.getByRole("menu", { name: "View menu" });
    await expect(viewMenu).toBeVisible();
    await viewMenu.getByTestId("matrix-card-view-piano").click();
    await expect(page.getByLabel("Global Card View")).toHaveValue("piano");

    await page
      .getByTestId("chord-card-I")
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
    await page.getByTestId("view-menu-toggle").click();
    const reopenedViewMenu = page.getByRole("menu", { name: "View menu" });
    await reopenedViewMenu.getByTestId("progression-card-view-piano").click();
    await expect(page.getByLabel("Progression Card View")).toHaveValue("piano");

    await page.getByRole("button", { name: "Project", exact: true }).click();
    const projectMenu = page.getByRole("menu", { name: "Project actions" });
    await expect(projectMenu).toBeVisible();
    await expect(projectMenu.getByTestId("project-save-as-btn")).toBeVisible();
    await expect(projectMenu.getByTestId("project-open-file-btn")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByTestId("export-menu-toggle").click();
    const exportMenu = page.getByRole("menu", { name: "Export menu" });
    await expect(exportMenu.getByTestId("project-export-btn")).toBeVisible();
    await expect(exportMenu.getByTestId("export-midi-btn")).toBeVisible();
    await expect(exportMenu.getByTestId("export-musicxml-btn")).toBeVisible();
    await page.keyboard.press("Escape");

    const statusBar = page.getByRole("contentinfo", { name: "Status bar" });
    await expect(statusBar).toBeVisible();
    await expect(statusBar.getByTestId("piano-audio-status")).toBeVisible();
  });

  test("switches between project tabs through the real Project menu flow", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Project", exact: true }).click();
    await page.getByTestId("new-project-btn").click();
    await page.getByTestId("project-name-input").fill("Second project");
    await page.getByRole("button", { name: "Create Project", exact: true }).click();

    await page.getByRole("button", { name: "Project", exact: true }).click();
    await page.getByTestId("new-project-btn").click();
    await page.getByTestId("project-name-input").fill("Third project");
    await page.getByRole("button", { name: "Create Project", exact: true }).click();

    const tabs = page.getByRole("tablist", { name: "Open projects" });
    await expect(tabs.getByRole("tab")).toHaveCount(3);
    await expect(tabs.getByTestId(/project-tab-close-/)).toHaveCount(3);
    const thirdTab = tabs.getByRole("tab", { name: "Active project: Third project" });
    await expect(thirdTab).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Third project");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
    await expect(tabs.getByRole("tab")).toHaveCount(3);
    await expect(tabs.getByRole("tab", { name: "Active project: Third project" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await tabs.getByRole("tab", { name: "Open project: CadenceFlow" }).click();
    await expect(tabs.getByRole("tab", { name: "Active project: CadenceFlow" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByTestId("project-menu-toggle")).toContainText("CadenceFlow");

    await tabs
      .locator(".project-tab-shell")
      .filter({ hasText: "Third project" })
      .getByTestId(/project-tab-close-/)
      .click();
    await expect(tabs.getByRole("tab")).toHaveCount(2);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    await expect(tabs.getByRole("tab", { name: /Third project/ })).toHaveCount(0);
  });
});
