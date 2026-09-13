import { expect, test, type Download, type Page } from "@playwright/test";

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
] as const;

async function openProjectMenu(page: Page): Promise<void> {
  await page.getByTestId("project-menu-toggle").click();
  await expect(page.getByRole("menu", { name: "Project actions" })).toBeVisible();
}

async function openExportMenu(page: Page): Promise<void> {
  await page.getByTestId("export-menu-toggle").click();
  await expect(page.getByRole("menu", { name: "Export menu" })).toBeVisible();
}

async function addChord(page: Page, functionId: string, modifiers?: "Control"): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click(modifiers ? { modifiers: [modifiers] } : undefined);
}

async function expectDownload(
  download: Promise<Download>,
  expectedFilename: string,
): Promise<void> {
  const file = await download;
  expect(file.suggestedFilename()).toBe(expectedFilename);
  expect(await file.path()).not.toBeNull();
}

test.describe("T149 — complete Studio journey", () => {
  for (const viewport of VIEWPORTS) {
    test(`completes project, compose, branch, edit, play, save, and export at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      test.slow();
      await page.setViewportSize(viewport);
      await page.addInitScript(() => {
        (
          window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
        ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
      });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("main", { name: "CadenceFlow Studio" })).toBeVisible();
      await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("navigation", { name: "Playback Transport" })).toBeVisible();

      await openProjectMenu(page);
      await page.getByTestId("new-project-btn").click();
      await page.getByTestId("project-name-input").fill("US10 Studio Journey");
      await page.getByRole("button", { name: "Create Project" }).click();
      await expect(page.getByTestId("project-menu-toggle")).toContainText("US10 Studio Journey");

      await addChord(page, "I", "Control");
      await addChord(page, "V", "Control");
      await expect(page.getByTestId("progression-step")).toHaveCount(2);

      await page.getByLabel("Branch origin").selectOption({ label: "After 1: I" });
      await page.getByRole("button", { name: "Explore Alternative" }).click();
      await expect(page.getByTestId("branch-controls-active")).toBeVisible();
      await addChord(page, "vi");
      const branch = page.getByRole("region", { name: "Original versus Alternative" });
      await expect(branch).toBeVisible();
      await expect(branch.locator(".branch-path").nth(1)).toContainText("vi");

      await page.getByLabel("Progression Card View").selectOption("staff");
      const score = page.getByTestId("progression-score-systems");
      const firstTarget = score.locator(".measure-staff-event-select").first();
      await firstTarget.click();
      const inspector = page.getByTestId("step-performance-inspector");
      await expect(inspector).toBeVisible();
      await inspector.getByRole("button", { name: "MIDI velocity view" }).click();
      const velocity = inspector.getByLabel("Master Velocity", { exact: true });
      await velocity.fill("96");
      await expect(velocity).toHaveValue("96");

      await page.getByRole("button", { name: "Play", exact: true }).click();
      await expect(page.getByTestId("transport-status")).toContainText("Playing");
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      await expect(page.getByTestId("transport-status")).toContainText("Stopped");

      await openProjectMenu(page);
      await page.getByTestId("project-save-as-btn").click();
      await page.getByTestId("save-project-as-name").fill("US10 Studio Journey Saved");
      await page.getByRole("button", { name: "Save Project As", exact: true }).click();
      await expect(page.getByTestId("project-menu-toggle")).toContainText(
        "US10 Studio Journey Saved",
      );

      await openExportMenu(page);
      const portableDownload = page.waitForEvent("download");
      await page.getByTestId("project-export-btn").click();
      await expectDownload(portableDownload, "US10 Studio Journey Saved.cadenceflow");

      await page.getByTestId("export-menu-toggle").click();
      await openExportMenu(page);
      const midiDownload = page.waitForEvent("download");
      await page.getByTestId("export-midi-btn").click();
      await expectDownload(midiDownload, "US10 Studio Journey Saved.mid");
    });
  }
});
