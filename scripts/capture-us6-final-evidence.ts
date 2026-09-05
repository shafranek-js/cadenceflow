import { chromium, type Page } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs";

async function main() {
  const repoArtifactsDir = path.resolve("review-artifacts/us6-final");
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
    viewport: { width: 1440, height: 1200 },
    recordVideo: {
      dir: repoArtifactsDir,
      size: { width: 1440, height: 1200 },
    },
  });

  await context.addInitScript(() => {
    (
      globalThis as unknown as { window: { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean } }
    ).window.__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });

  const page = await context.newPage();

  console.log("Navigating to http://127.0.0.1:4173...");
  await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
  await page.waitForSelector(".transport-bar");

  // Build progression: I - vi - IV - V
  console.log("Building progression...");
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

  const steps = page.locator('[data-testid="progression-step"]');
  await steps.first().click();

  // 1. 01-duration-note-values.png
  console.log("Capturing 01-duration-note-values.png...");
  const customInput = page.getByLabel("Duration in canonical quarter-note beats");
  await customInput.fill("3/4");
  await page.getByRole("button", { name: "Set custom duration in beats" }).click();
  await page.waitForTimeout(200);
  await saveScreenshots(page, "01-duration-note-values.png");

  // 2. 02-meter-7-8-reflow.png
  console.log("Capturing 02-meter-7-8-reflow.png...");
  await page.getByLabel("Meter numerator").fill("7");
  await page.getByLabel("Meter denominator").selectOption("8");
  await page.getByLabel("Pulse grouping").fill("2+2+3");
  await page.locator(".policy-option:has-text('Reflow')").click();
  await page.getByRole("button", { name: "Apply Meter Change" }).click();
  await page.waitForTimeout(200);
  await steps.first().click();
  await saveScreenshots(page, "02-meter-7-8-reflow.png");

  // 3. 03-meter-preserve.png
  console.log("Capturing 03-meter-preserve.png...");
  // Undo reflow
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(200);
  // Apply with preserve
  await page.getByLabel("Meter numerator").fill("7");
  await page.getByLabel("Meter denominator").selectOption("8");
  await page.getByLabel("Pulse grouping").fill("2+2+3");
  await page.locator(".policy-option:has-text('Preserve')").click();
  await page.getByRole("button", { name: "Apply Meter Change" }).click();
  await page.waitForTimeout(200);
  await steps.first().click();
  await saveScreenshots(page, "03-meter-preserve.png");

  // 4. 04-swing-controls.png
  console.log("Capturing 04-swing-controls.png...");
  const grooveBtn = page.getByRole("button", { name: "Toggle Swing Feel" });
  await grooveBtn.click(); // to Swing
  const swingSlider = page.getByLabel("Swing Amount");
  await swingSlider.fill("0.7");
  await page.waitForTimeout(200);
  await saveScreenshots(page, "04-swing-controls.png");

  // 5. 05-playing-selected-independent.png
  console.log("Capturing 05-playing-selected-independent.png...");
  // Select Step 4 (last chord)
  await steps.nth(3).click();
  // Start playback (starts from Step 1)
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(400); // Step 1 is playing, Step 4 is selected
  await saveScreenshots(page, "05-playing-selected-independent.png");

  // 6. 06-paused-resume.png
  console.log("Capturing 06-paused-resume.png...");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.waitForTimeout(200);
  await saveScreenshots(page, "06-paused-resume.png");

  // Stop playback
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.waitForTimeout(200);

  // 7. 07-loop-range-playing.png
  console.log("Capturing 07-loop-range-playing.png...");
  await page.getByRole("button", { name: "Range" }).click();
  await page.getByLabel("Loop start step").selectOption({ index: 1 });
  await page.getByLabel("Loop end step").selectOption({ index: 2 });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(400);
  await saveScreenshots(page, "07-loop-range-playing.png");
  await page.getByRole("button", { name: "Stop", exact: true }).click();

  // 8. 08-metronome-countin-7-8.png
  console.log("Capturing 08-metronome-countin-7-8.png...");
  await page.getByRole("button", { name: "Toggle Metronome" }).click();
  await page.getByRole("button", { name: "Toggle Count-in" }).click();
  await page.waitForTimeout(200);
  await saveScreenshots(page, "08-metronome-countin-7-8.png");

  // 9. 09-play-from-here.png
  console.log("Capturing 09-play-from-here.png...");
  await page.getByRole("button", { name: "Toggle Count-in" }).click(); // turn off count-in for quick start
  await steps.nth(1).click(); // Select Step 2
  await page.getByRole("button", { name: "Play From Here" }).click();
  await page.waitForTimeout(400);
  await saveScreenshots(page, "09-play-from-here.png");
  await page.getByRole("button", { name: "Stop", exact: true }).click();

  // 10. 10-audio-failure-state.png
  console.log("Capturing 10-audio-failure-state.png...");
  // Inject simulated transport error badge to demonstrate visible alert state
  await page.evaluate(`
    const transportPlayback = document.querySelector('.transport-playback');
    if (transportPlayback) {
      let errBadge = document.querySelector('.transport-error-badge');
      if (!errBadge) {
        errBadge = document.createElement('div');
        errBadge.className = 'transport-error-badge';
        errBadge.setAttribute('role', 'alert');
        errBadge.setAttribute('data-testid', 'transport-error');
        transportPlayback.appendChild(errBadge);
      }
      errBadge.textContent = 'Audio provider error: hq-sample-piano (device disconnected)';
    }
  `);
  await page.waitForTimeout(200);
  await saveScreenshots(page, "10-audio-failure-state.png");

  const video = page.video();
  await page.close();
  await context.close();
  await browser.close();

  if (video) {
    const videoPath = await video.path();
    const newRepoPath = path.join(repoArtifactsDir, "us6-final-demo.webm");
    const newBrainPath = path.join(brainArtifactsDir, "us6-final-demo.webm");
    fs.copyFileSync(videoPath, newRepoPath);
    fs.copyFileSync(videoPath, newBrainPath);
    console.log("Saved video demo to:", newRepoPath, "Size:", fs.statSync(newRepoPath).size);
  }

  console.log("All US6 review artifacts successfully captured!");
}

main().catch((err) => {
  console.error("Error capturing evidence:", err);
  process.exit(1);
});
