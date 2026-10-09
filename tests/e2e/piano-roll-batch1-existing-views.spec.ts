import { requireValue } from "../fixtures/assertions";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CURRENT_PROJECT_SCHEMA_VERSION } from "../../src/domain/project/migrations";
import { addRestToProgression } from "./test-helpers/progression-settings";

const screenshotRoot =
  process.env.CADENCEFLOW_BATCH1_SCREENSHOT_ROOT ??
  "C:/Users/pavel/.codex/visualizations/2026/09/30/01a0f3c2-898f-7322-a361-ad7b563d465e/piano-roll-batch1";
const views = ["staff", "tablature"] as const;
const sizes = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 640, height: 360 },
] as const;

type PortableFixture = {
  name: string;
  presentation: { progressionView: string; measuresPerSystem: number };
  progression: {
    steps: Array<{
      id: string;
      kind: string;
      duration?: unknown;
      authoredMelody?: unknown;
      melodyInstrumentOverride?: string;
      [key: string]: unknown;
    }>;
  };
};

test("v9 authored Rest continuation remains usable in every existing view and theme", async ({
  page,
}) => {
  mkdirSync(screenshotRoot, { recursive: true });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await page
    .getByTestId("chord-card-I")
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
  await addRestToProgression(page);
  const sourceDownload = page.waitForEvent("download");
  await page.getByTestId("export-menu-toggle").click();
  await page.getByRole("menu", { name: "Export menu" }).getByTestId("project-export-btn").click();
  const sourceFile = await sourceDownload;
  const sourcePath = await sourceFile.path();
  if (!sourcePath) throw new Error("Could not read the portable fixture Project");
  const raw = JSON.parse(await readFile(sourcePath, "utf8")) as PortableFixture;
  raw.name = "Batch 1 Rest Melody visual gate";
  raw.presentation.progressionView = "piano-roll";
  raw.presentation.measuresPerSystem = 1;
  const restIndex = raw.progression.steps.findIndex(
    (step: Record<string, unknown>) => step.kind === "rest",
  );
  if (restIndex < 0) throw new Error("Test fixture did not create a Rest Step");
  const rest = raw.progression.steps.splice(restIndex, 1)[0];
  requireValue(rest).id = "rest-melody-owner";
  requireValue(rest).duration = { beats: { numerator: 2, denominator: 1 } };
  requireValue(rest).authoredMelody = {
    notes: [
      {
        id: "rest-long-continuation",
        pitch: {
          midiNumber: 76,
          pitchClassIdentity: 4,
          octave: 5,
          spelling: { step: "E", alter: 0 },
        },
        onset: { numerator: 1, denominator: 4 },
        duration: { numerator: 6, denominator: 1 },
      },
      {
        id: "rest-overlapping-polyphony",
        pitch: {
          midiNumber: 76,
          pitchClassIdentity: 4,
          octave: 5,
          spelling: { step: "E", alter: 0 },
        },
        onset: { numerator: 1, denominator: 4 },
        duration: { numerator: 1, denominator: 1 },
      },
    ],
  };
  requireValue(rest).melodyInstrumentOverride = "cello";
  raw.progression.steps.unshift(requireValue(rest));
  if (!raw.progression.steps.some((step: Record<string, unknown>) => step.kind === "chord")) {
    throw new Error("Test fixture must retain the UI-created chord after the Rest owner");
  }
  await page.keyboard.press("Escape");
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: "piano-roll-batch1.cadenceflow",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(raw)),
  });
  await expect(page.getByTestId("project-menu-toggle")).toContainText(
    "Batch 1 Rest Melody visual gate",
  );
  await page.getByTestId("project-menu-toggle").click();
  await expect(page.getByRole("menu", { name: "Project actions" })).toHaveCount(0);
  await expect(
    page.locator("[data-piano-roll-event-key='rest-long-continuation']").first(),
  ).toBeVisible();
  const initialFragments = await page
    .locator("[data-piano-roll-event-key='rest-long-continuation']")
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none"
          );
        })
        .map((element) => ({
          startsHere: !element.classList.contains("is-continuation"),
          start: element.getAttribute("data-fragment-start-beats"),
          duration: element.getAttribute("data-fragment-duration-beats"),
          sourceStep: element.getAttribute("data-source-step-id"),
        })),
    );
  expect(initialFragments).toHaveLength(2);
  expect(initialFragments.filter((fragment) => fragment.startsHere)).toHaveLength(1);
  expect(initialFragments.every((fragment) => fragment.sourceStep === "rest-melody-owner")).toBe(
    true,
  );
  expect(initialFragments.map((fragment) => fragment.start)).toEqual(["1/4", "4/1"]);
  expect(initialFragments.map((fragment) => fragment.duration)).toEqual(["15/4", "2/1"]);
  const totalEffectiveDuration = initialFragments.reduce((sum, fragment) => {
    const [numerator, denominator = "1"] = (fragment.duration ?? "0").split("/");
    return sum + Number(numerator) / Number(denominator);
  }, 0);
  expect(totalEffectiveDuration).toBeCloseTo(5.75, 6);
  const simultaneousFragments = page.locator(
    "[data-piano-roll-event-key='rest-overlapping-polyphony']",
  );
  await expect(simultaneousFragments).toHaveCount(1);
  await expect(simultaneousFragments.first()).toHaveAttribute("data-fragment-start-beats", "1/4");
  await expect(simultaneousFragments.first()).toHaveAttribute(
    "data-fragment-duration-beats",
    "1/1",
  );
  await expect(page.getByTestId("piano-roll-harmony-grid-lines").first()).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-menu-toggle").click();
  await page.getByRole("menu", { name: "Export menu" }).getByTestId("project-export-btn").click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("Could not read exported Project");
  const roundTrip = JSON.parse(await readFile(downloadPath, "utf8"));
  expect(roundTrip.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
  expect(roundTrip.presentation.progressionView).toBe("piano-roll");
  expect(roundTrip.progression.steps[0]!.authoredMelody.notes[0]!.duration).toEqual({
    numerator: 6,
    denominator: 1,
  });
  await page.keyboard.press("Escape");

  for (const theme of ["dark", "light"] as const) {
    await page
      .getByRole("button", { name: theme === "dark" ? "Dark theme" : "Light theme" })
      .click();
    for (const size of sizes) {
      await page.setViewportSize(size);
      for (const view of views) {
        await page.getByTestId(`progression-view-btn-${view}`).click();
        await expect(
          page.locator(`[data-view='${view}'], [data-progression-view='${view}']`).first(),
        ).toBeVisible({ timeout: 10_000 });
        const renderedNote = page
          .locator("[data-melody-event-key='rest-long-continuation']")
          .first();
        await expect(renderedNote).toBeVisible();
        const metrics = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
          zoom: getComputedStyle(document.documentElement).zoom,
        }));
        expect(metrics.width).toBeLessThanOrEqual(metrics.client);
        expect(metrics.zoom).toBe("1");
        await renderedNote.evaluate((element) => element.scrollIntoView({ block: "center" }));
        await page.screenshot({
          path: `${screenshotRoot}/${view}-${theme}-${size.width}x${size.height}.png`,
        });
      }
    }
  }
});
