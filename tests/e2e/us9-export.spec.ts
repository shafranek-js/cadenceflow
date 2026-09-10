import { expect, test, type Download, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { ensureHistoryControlsVisible } from "./test-helpers/global-settings";

async function openProjectMenu(page: Page): Promise<void> {
  await page.getByTestId("project-menu-toggle").click();
  await expect(page.getByRole("menu", { name: "Project actions" })).toBeVisible();
}

async function openExportMenu(page: Page): Promise<void> {
  await page.getByTestId("export-menu-toggle").click();
  await expect(page.getByRole("menu", { name: "Export menu" })).toBeVisible();
}

async function waitForApp(page: Page): Promise<void> {
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
}

async function addChord(page: Page, functionId: string): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({
      modifiers: ["Control"],
    });
}

async function readDownload(download: Download): Promise<Buffer> {
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!);
}

async function clickExport(page: Page, testId: "export-midi-btn" | "export-musicxml-btn") {
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId(testId).click();
  const download = await downloadPromise;
  return { download, bytes: await readDownload(download) };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitForApp(page);
  await ensureHistoryControlsVisible(page);
});

function midiNoteOnCount(bytes: Uint8Array): number {
  const trackCount = bytes[10]! * 256 + bytes[11]!;
  let trackOffset = 14;
  let count = 0;
  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    expect(String.fromCharCode(...bytes.slice(trackOffset, trackOffset + 4))).toBe("MTrk");
    const trackLength =
      bytes[trackOffset + 4]! * 0x1000000 +
      (bytes[trackOffset + 5]! << 16) +
      (bytes[trackOffset + 6]! << 8) +
      bytes[trackOffset + 7]!;
    const end = trackOffset + 8 + trackLength;
    let offset = trackOffset + 8;
    while (offset < end) {
      let deltaComplete = false;
      while (!deltaComplete) {
        const byte = bytes[offset++];
        if (byte === undefined) throw new Error("truncated MIDI delta");
        deltaComplete = (byte & 0x80) === 0;
      }
      const status = bytes[offset++];
      if (status === undefined) throw new Error("truncated MIDI status");
      if (status === 0xff) {
        offset++;
        let length = 0;
        let lengthComplete = false;
        while (!lengthComplete) {
          const byte = bytes[offset++];
          if (byte === undefined) throw new Error("truncated MIDI meta length");
          length = (length << 7) | (byte & 0x7f);
          lengthComplete = (byte & 0x80) === 0;
        }
        offset += length;
        continue;
      }
      const command = status & 0xf0;
      if (command === 0xc0 || command === 0xd0) {
        offset += 1;
        continue;
      }
      offset += 2;
      if (command === 0x90 && bytes[offset - 1]! > 0) count++;
    }
    expect(offset).toBe(end);
    trackOffset = end;
  }
  expect(trackOffset).toBe(bytes.length);
  return count;
}

function assertMusicXmlStructure(xml: string): void {
  expect(xml).toContain('<score-partwise version="4.0">');
  expect(xml).toMatch(/<key>[\s\S]*<fifths>0<\/fifths>[\s\S]*<mode>major<\/mode>/);
  expect(xml).toMatch(/<time>[\s\S]*<beats>4<\/beats>[\s\S]*<beat-type>4<\/beat-type>/);
  expect(xml).toContain("<per-minute>100</per-minute>");
  expect(xml).toContain("<note>");
}

test.describe("US9 Batch C — export UI and final acceptance", () => {
  test("exports the latest UI state, preserves history, and excludes an active branch", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForApp(page);

    await openProjectMenu(page);
    await page.getByTestId("rename-project-btn").click();
    await page.getByTestId("project-name-input").fill("Session: / take?*");
    await page.getByRole("button", { name: "Rename Project", exact: true }).click();
    await expect(page.getByTestId("project-menu-toggle")).toContainText("Session: / take?*");

    await addChord(page, "I");
    const firstStep = page.locator('[data-testid="progression-step"]').first();
    await firstStep.click();
    await expect(firstStep).toHaveAttribute("data-selected", "true");
    await page.getByRole("button", { name: "MIDI velocity view" }).click();
    await page.getByLabel("Master Velocity", { exact: true }).fill("95");
    await expect(page.getByLabel("Master Velocity", { exact: true })).toHaveValue("95");
    await page.getByTestId("duration-preset-half").first().click();
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

    // Export immediately after a fresh UI edit; no autosave wait or reload is used.
    await openExportMenu(page);
    const firstMidi = await clickExport(page, "export-midi-btn");
    expect(firstMidi.download.suggestedFilename()).toBe("Session- - take--.mid");
    expect(firstMidi.bytes.subarray(0, 4).toString("ascii")).toBe("MThd");
    expect([...firstMidi.bytes.subarray(8, 12)]).toEqual([0, 1, 0, 3]);
    const noteCountBeforeBranch = midiNoteOnCount(firstMidi.bytes);
    expect(noteCountBeforeBranch).toBe(4);
    await page.getByTestId("export-menu-toggle").click();
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

    // Create a redo state before export and verify the pure export does not clear it.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();
    const redoStepText = await firstStep.innerText();
    await openExportMenu(page);
    const redoMidi = await clickExport(page, "export-midi-btn");
    expect(redoMidi.bytes.subarray(0, 4).toString("ascii")).toBe("MThd");
    expect(midiNoteOnCount(redoMidi.bytes)).toBe(noteCountBeforeBranch);
    await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();
    await page.getByTestId("export-menu-toggle").click();
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(firstStep).toContainText(redoStepText.split("\n")[0] ?? "I");

    // Swing and a live temporary branch produce concise MusicXML diagnostics;
    // the branch itself is never used as the export source.
    await page.getByRole("button", { name: "Toggle Swing Feel" }).click();
    await page.getByRole("button", { name: "Explore Alternative" }).click();
    await expect(page.getByRole("button", { name: "Commit Branch" })).toBeVisible();
    await page.getByTestId("chord-card-iv").locator("button.chord-main").click();
    await expect(page.getByText("What-if branch active", { exact: true })).toBeVisible();

    await openExportMenu(page);
    const branchMidi = await clickExport(page, "export-midi-btn");
    expect(branchMidi.download.suggestedFilename()).toBe("Session- - take--.mid");
    expect(midiNoteOnCount(branchMidi.bytes)).toBe(noteCountBeforeBranch);
    expect(branchMidi.bytes.equals(firstMidi.bytes)).toBe(true);

    const musicXml = await clickExport(page, "export-musicxml-btn");
    expect(musicXml.download.suggestedFilename()).toBe("Session- - take--.musicxml");
    const xml = musicXml.bytes.toString("utf8");
    expect(xml).toContain('<score-partwise version="4.0">');
    expect(xml).not.toContain("branch");
    assertMusicXmlStructure(xml);
    await expect(page.getByTestId("export-musicxml-status")).toContainText("Notation omissions:");
    await expect(page.getByTestId("export-musicxml-status")).toContainText("Swing");
    await expect(page.getByTestId("export-musicxml-status")).toContainText("temporary branch");

    await page.getByTestId("export-menu-toggle").click();
    expect(await firstStep.innerText()).toContain("I");
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  test("blocks both musical exports for a completely empty progression", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await page.getByRole("button", { name: "Explore Alternative" }).click();
    await expect(page.getByText("What-if branch active", { exact: true })).toBeVisible();
    await openExportMenu(page);
    await expect(page.getByTestId("export-empty-message")).toHaveText(
      "Add musical content to My Progression before exporting.",
    );
    await expect(page.getByTestId("export-midi-btn")).toBeDisabled();
    await expect(page.getByTestId("export-musicxml-btn")).toBeDisabled();
    await expect(page.getByTestId("project-export-btn")).toBeEnabled();
  });

  test("exports a Rest-only progression and supports repeated downloads", async ({ page }) => {
    await page.goto("/");
    await waitForApp(page);
    await page.getByRole("button", { name: "Add Rest to progression" }).click();
    await expect(page.locator('[data-testid="progression-step"]')).toHaveCount(1);

    await openExportMenu(page);
    await expect(page.getByTestId("export-midi-btn")).toBeEnabled();
    await expect(page.getByTestId("export-musicxml-btn")).toBeEnabled();

    const firstMidi = await clickExport(page, "export-midi-btn");
    expect(firstMidi.download.suggestedFilename()).toBe("CadenceFlow.mid");
    expect(firstMidi.bytes.subarray(0, 4).toString("ascii")).toBe("MThd");
    expect(midiNoteOnCount(firstMidi.bytes)).toBe(0);
    const secondMidi = await clickExport(page, "export-midi-btn");
    expect(secondMidi.download.suggestedFilename()).toBe("CadenceFlow.mid");
    expect(secondMidi.bytes.equals(firstMidi.bytes)).toBe(true);

    const musicXml = await clickExport(page, "export-musicxml-btn");
    expect(musicXml.download.suggestedFilename()).toBe("CadenceFlow.musicxml");
    expect(musicXml.bytes.toString("utf8")).toContain("<rest/>");
    await expect(page.getByTestId("export-musicxml-status")).toHaveText("MusicXML exported.");
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  });

  test("reports a download error without creating a file or damaging the project", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: undefined,
      });
    });
    await page.goto("/");
    await waitForApp(page);
    await addChord(page, "I");
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
    let downloadObserved = false;
    page.on("download", () => {
      downloadObserved = true;
    });
    await openExportMenu(page);
    await page.getByTestId("export-midi-btn").click();
    await expect(page.getByTestId("export-midi-status")).toHaveRole("alert");
    await expect(page.getByTestId("export-midi-status")).toContainText(
      "This browser cannot download exported musical files.",
    );
    expect(downloadObserved).toBe(false);
    await expect(page.locator('[data-testid="progression-step"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  });
});
