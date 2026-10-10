import { expect, test, type Page } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";
import {
  simpleMidi,
  simpleXml,
  scoreXml,
  attributes,
  xmlNote,
  midiFixture,
} from "../fixtures/score-import.fixture";

async function openImport(page: Page) {
  await page.getByTestId("project-menu-toggle").click();
  await expect(page.getByTestId("score-import-button")).toBeVisible();
}
async function snapshot(page: Page): Promise<{
  id: string;
  name: string;
  progression: { steps: { kind: string; authoredMelody?: { notes: unknown[] } }[] };
  globalTiming: { tempoBpm: number; meter: { numerator: number; denominator: number } };
  melodyTrack: { instrument: string };
}> {
  await page.waitForFunction(() =>
    Boolean(
      (
        window as unknown as {
          __cadenceflow_persistence__?: { lastScheduledProjectSnapshot?: string };
        }
      ).__cadenceflow_persistence__?.lastScheduledProjectSnapshot,
    ),
  );
  return page.evaluate(() =>
    JSON.parse(
      (
        window as unknown as {
          __cadenceflow_persistence__: { lastScheduledProjectSnapshot: string };
        }
      ).__cadenceflow_persistence__.lastScheduledProjectSnapshot,
    ),
  );
}
async function projectCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open("CadenceFlowDB");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            count = db.transaction("projects").objectStore("projects").count();
          count.onsuccess = () => {
            resolve(count.result);
            db.close();
          };
          count.onerror = () => reject(count.error);
        };
      }),
  );
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (
      window as unknown as { __CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__ = true;
  });
  await page.goto("/");
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible();
  await expect.poll(() => projectCount(page)).toBe(1);
});
test("single MIDI auto-import creates a saved independent project and survives reload", async ({
  page,
}) => {
  const original = await snapshot(page);
  await openImport(page);
  await page.getByTestId("score-import-file").setInputFiles({
    name: "single.mid",
    mimeType: "audio/midi",
    buffer: Buffer.from(simpleMidi()),
  });
  await expect(page.getByTestId("project-menu-toggle")).toContainText("single");
  expect(await page.getByRole("dialog").count()).toBe(0);
  await expect.poll(() => projectCount(page)).toBe(2);
  const imported = await snapshot(page);
  expect(imported.id).not.toBe(original.id);
  await expect(page.getByTestId(`project-tab-${original.id}`)).toBeVisible();
  await expect(page.getByTestId(`project-tab-${imported.id}`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(imported.melodyTrack.instrument).toBe("gm-024");
  expect(imported.progression.steps[0]!.authoredMelody?.notes).toHaveLength(1);
  await page.reload();
  await expect(page.getByTestId("project-menu-toggle")).toContainText("single");
  await expect.poll(() => projectCount(page)).toBe(2);
  await expect(page.getByTestId(`project-tab-${original.id}`)).toBeVisible();
  await expect(page.getByTestId(`project-tab-${imported.id}`)).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
test("multi MIDI requires a choice; cancel and Escape preserve the original project", async ({
  page,
}, testInfo) => {
  const original = await snapshot(page);
  await openImport(page);
  const bytes = midiFixture([
    [0, 144, 60, 80, 0, 193, 73, 0, 145, 67, 80, 96, 128, 60, 0, 0, 129, 67, 0, 0, 255, 47, 0],
  ]);
  const file = { name: "multi.mid", mimeType: "audio/midi", buffer: Buffer.from(bytes) };
  await page.getByTestId("score-import-file").setInputFiles(file);
  const dialog = page.getByRole("dialog", { name: "Choose an instrument to import" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Create project" })).toBeDisabled();
  await expect(dialog.getByLabel("Instrument", { exact: true })).toHaveValue("");
  await page.screenshot({ path: testInfo.outputPath("multi-midi-picker.png") });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect((await snapshot(page)).id).toBe(original.id);
  expect(await projectCount(page)).toBe(1);
  await page.getByTestId("score-import-file").setInputFiles(file);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect((await snapshot(page)).id).toBe(original.id);
  await page.getByTestId("score-import-file").setInputFiles(file);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Instrument", { exact: true }).selectOption({ index: 2 });
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByTestId("project-menu-toggle")).toContainText("multi");
  expect((await snapshot(page)).melodyTrack.instrument).toBe("flute");
  await expect.poll(() => projectCount(page)).toBe(2);
});
test("multi MusicXML imports only the chosen instrument", async ({ page }, testInfo) => {
  await openImport(page);
  const body = `<measure>${attributes}${xmlNote("C", 12)}</measure>`,
    second = `<measure>${attributes}${xmlNote("G", 12)}</measure>`;
  await page.getByTestId("score-import-file").setInputFiles({
    name: "ensemble.musicxml",
    mimeType: "application/xml",
    buffer: Buffer.from(scoreXml(body, second)),
  });
  const dialog = page.getByRole("dialog", { name: "Choose an instrument to import" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Instrument", { exact: true }).selectOption({ label: "Flute — 1 notes" });
  await page.screenshot({ path: testInfo.outputPath("musicxml-picker.png") });
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByTestId("project-menu-toggle")).toContainText("ensemble");
  const imported = await snapshot(page);
  expect(imported.melodyTrack.instrument).toBe("flute");
  expect(
    imported.progression.steps.flatMap((step) => step.authoredMelody?.notes ?? []),
  ).toHaveLength(1);
});
test("single MusicXML and compressed MXL import directly without a chooser", async ({ page }) => {
  await openImport(page);
  await page.getByTestId("score-import-file").setInputFiles({
    name: "plain.xml",
    mimeType: "application/xml",
    buffer: Buffer.from(simpleXml()),
  });
  await expect(page.getByTestId("project-menu-toggle")).toContainText("plain");
  expect(await page.getByRole("dialog").count()).toBe(0);
  const archive = zipSync({
    "META-INF/container.xml": strToU8(
      '<container><rootfiles><rootfile full-path="music/main.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>',
    ),
    "music/main.musicxml": strToU8(simpleXml()),
  });
  if (!(await page.getByTestId("score-import-file").count())) await openImport(page);
  await page.getByTestId("score-import-file").setInputFiles({
    name: "compressed.mxl",
    mimeType: "application/vnd.recordare.musicxml",
    buffer: Buffer.from(archive),
  });
  await expect(page.getByTestId("project-menu-toggle")).toContainText("compressed");
  await expect.poll(() => projectCount(page)).toBe(3);
});
test("invalid score errors do not create or change projects", async ({ page }) => {
  const original = await snapshot(page);
  await openImport(page);
  for (const file of [
    { name: "broken.mid", mimeType: "audio/midi", buffer: Buffer.from("MThd") },
    { name: "broken.xml", mimeType: "application/xml", buffer: Buffer.from("<score-partwise>") },
  ]) {
    await page.getByTestId("score-import-file").setInputFiles(file);
    await expect(page.getByRole("alert")).toBeVisible();
    expect((await snapshot(page)).id).toBe(original.id);
    expect(await projectCount(page)).toBe(1);
  }
});
test("real supplied guitar score preserves 113 measures and survives reload", async ({
  page,
}, testInfo) => {
  test.skip(
    !process.env.CADENCEFLOW_IMPORT_FIXTURE,
    "Optional private user fixture is supplied locally for acceptance.",
  );
  await openImport(page);
  await page
    .getByTestId("score-import-file")
    .setInputFiles(process.env.CADENCEFLOW_IMPORT_FIXTURE!);
  const dialog = page.getByRole("dialog", { name: "Review score import" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("note", { name: "Import limitations" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("guitar-import-warnings.png") });
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect.poll(async () => (await snapshot(page)).progression.steps.length).toBe(113);
  const imported = await snapshot(page);
  expect(imported.globalTiming.tempoBpm).toBe(124);
  expect(imported.globalTiming.meter).toMatchObject({ numerator: 3, denominator: 4 });
  expect(imported.melodyTrack.instrument).toBe("gm-024");
  expect(
    imported.progression.steps.flatMap((step) => step.authoredMelody?.notes ?? []),
  ).toHaveLength(533);
  await page.screenshot({ path: testInfo.outputPath("guitar-import-staff.png") });
  await page.reload();
  await expect.poll(async () => (await snapshot(page)).progression.steps.length).toBe(113);
  await expect.poll(() => projectCount(page)).toBe(2);
});
