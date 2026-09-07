import { expect, test, type Page } from "@playwright/test";

async function openProjectMenu(page: Page) {
  await page.getByTestId("project-menu-toggle").click();
  await expect(page.getByRole("menu", { name: "Project actions" })).toBeVisible();
}

test.describe("US8 Batch C — project actions", () => {
  test("creates, renames, switches, and deletes a named project", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible();

    await openProjectMenu(page);
    await page.getByTestId("new-project-btn").click();
    await page.getByTestId("project-name-input").fill("Verse idea");
    await page.getByRole("button", { name: "Create Project" }).click();
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Verse idea");

    await openProjectMenu(page);
    await page.getByTestId("rename-project-btn").click();
    await page.getByTestId("project-name-input").fill("Chorus idea");
    await page.getByRole("button", { name: "Rename Project", exact: true }).click();
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Chorus idea");

    await openProjectMenu(page);
    await page.getByTestId("project-save-as-btn").click();
    await page.getByTestId("save-project-as-name").fill("Saved Copy");
    await page.getByRole("button", { name: "Save Project As", exact: true }).click();
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Saved Copy");

    await page.getByTestId("new-project-btn").click();
    await page.getByTestId("project-name-input").fill("Bridge idea");
    await page.getByRole("button", { name: "Create Project" }).click();
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Bridge idea");

    await openProjectMenu(page);
    await expect(
      page.getByTestId("project-open-select").locator("option").filter({ hasText: "Chorus idea" }),
    ).toHaveCount(1);
    await page.getByTestId("project-open-select").selectOption({ label: "Chorus idea" });
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Chorus idea");

    await openProjectMenu(page);
    await page.getByTestId("delete-project-btn").click();
    await expect(page.getByRole("dialog", { name: "Delete Project?" })).toBeVisible();
    await page.getByTestId("confirm-delete-project-btn").click();
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Bridge idea");
  });

  test("recovers the active named project after reload with a fresh history", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible();

    await openProjectMenu(page);
    await page.getByTestId("new-project-btn").click();
    await page.getByTestId("project-name-input").fill("Recovered Session");
    await page.getByRole("button", { name: "Create Project" }).click();
    await page.getByTestId("chord-card-I").getByRole("button", { name: /Add I/ }).click();
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

    await page.reload();
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Recovered Session");
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  test("exports canonical project data and opens it through the file chooser with fresh history", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible();

    // Add a real progression step so the exported payload is non-trivial and
    // creates an Undo entry that must disappear after import.
    await page.getByTestId("chord-card-I").getByRole("button", { name: /Add I/ }).click();
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

    await openProjectMenu(page);
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("project-export-btn").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("CadenceFlow.cadenceflow");
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();

    await page.getByTestId("project-open-file-btn").click();
    await page.getByTestId("project-file-input").setInputFiles(downloadPath!);
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Imported Copy");
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  });
});
