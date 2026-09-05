import { chromium, type Page } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs";

async function main() {
  const repoArtifactsDir = path.resolve("review-artifacts/us6-batch-c");
  const brainArtifactsDir =
    "C:\\Users\\pavel\\.gemini\\antigravity\\brain\\b7baeb67-2bbc-4d13-8a03-ad5f1ee7da84";

  for (const dir of [repoArtifactsDir, brainArtifactsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const saveScreenshots = async (page: Page, filename: string) => {
    const p1 = path.join(repoArtifactsDir, filename);
    const p2 = path.join(brainArtifactsDir, filename);
    await page.screenshot({ path: p1 });
    await page.screenshot({ path: p2 });
    console.log("Captured:", filename);
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1400 },
  });
  const page = await context.newPage();

  console.log("Navigating to http://127.0.0.1:4173...");
  await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
  await page.waitForSelector(".transport-bar");

  // Populate 4-chord progression: I - vi - IV - V
  console.log("Populating progression...");
  await page
    .getByTestId("chord-card-I")
    .getByRole("button", { name: /Add I to progression/i })
    .click();
  await page
    .getByTestId("chord-card-vi")
    .getByRole("button", { name: /Add vi to progression/i })
    .click();
  await page
    .getByTestId("chord-card-IV")
    .getByRole("button", { name: /Add IV to progression/i })
    .click();
  await page
    .getByTestId("chord-card-V")
    .getByRole("button", { name: /Add V to progression/i })
    .click();

  // Select the first step so step duration editor shows details
  const steps = page.getByTestId("progression-step");
  await steps.first().click();

  // 1. Stopped state
  console.log("Capturing 01-transport-stopped.png...");
  await saveScreenshots(page, "01-transport-stopped.png");

  // 2. Playing state
  console.log("Starting playback...");
  await page.locator(".transport-play").click();
  await page.waitForTimeout(400); // allow audio/playhead to start and track step
  console.log("Capturing 02-transport-playing.png...");
  await saveScreenshots(page, "02-transport-playing.png");

  // 3. Paused state
  console.log("Pausing playback...");
  await page.locator(".transport-pause").click();
  await page.waitForTimeout(200);
  console.log("Capturing 03-transport-paused.png...");
  await saveScreenshots(page, "03-transport-paused.png");

  // Reset to stopped for configuration changes
  await page.locator(".transport-stop").click();

  // 4. Custom 7/8 grouping
  console.log("Setting 7/8 with 3+2+2 grouping...");
  const numInput = page.locator(".meter-num-input");
  await numInput.fill("7");
  const denSelect = page.locator(".meter-den-select");
  await denSelect.selectOption("8");
  const groupingInput = page.locator(".meter-grouping-input");
  await groupingInput.fill("3+2+2");
  await page.locator(".meter-apply-btn").click();
  await page.waitForTimeout(200);
  console.log("Capturing 04-custom-7-8-grouping.png...");
  await saveScreenshots(page, "04-custom-7-8-grouping.png");

  // 5. Loop Range
  console.log("Activating Loop Range...");
  const rangeBtn = page.getByRole("button", { name: "Range" });
  await rangeBtn.click();
  await page.waitForSelector(".loop-range-selectors");

  const loopSelects = page.locator(".loop-step-select");
  const optionsCount = await loopSelects.last().locator("option").count();
  if (optionsCount >= 3) {
    const endOptionVal = await loopSelects.last().locator("option").nth(2).getAttribute("value");
    if (endOptionVal) {
      await loopSelects.last().selectOption(endOptionVal);
    }
  }
  await page.waitForTimeout(200);
  console.log("Capturing 05-loop-range.png...");
  await saveScreenshots(page, "05-loop-range.png");

  // 6. Metronome and Count-in
  console.log("Toggling Metronome and Count-In...");
  await page.getByRole("button", { name: "Toggle Metronome" }).click();
  await page.getByRole("button", { name: "Toggle Count-in" }).click();
  await page.waitForTimeout(100);
  console.log("Capturing 06-metronome-countin.png...");
  await saveScreenshots(page, "06-metronome-countin.png");

  await browser.close();
  console.log("All 6 screenshots captured successfully!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
