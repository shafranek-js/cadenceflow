import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { Project } from "../../src/domain/project/project";
import { createEffectiveMelodyTimeline } from "../../src/domain/melody/effectiveTimeline";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../src/persistence/portableProject";
import { createPianoRollSystemChordFixture } from "../fixtures/piano-roll-system-chord.fixture";

const VIEWS = ["staff", "tablature", "piano-roll"] as const;
const SCREENSHOT_DIRECTORY = join(
  process.cwd(),
  "artifacts",
  "validation",
  "t212-transposition",
  "screenshots",
);

async function createFourStepProgression(page: Page): Promise<void> {
  await page.goto("/");
  for (const functionId of ["I", "vi", "IV", "V"]) {
    await page
      .getByTestId(`chord-card-${functionId}`)
      .locator(".chord-main")
      .click({ modifiers: ["Control"] });
  }
  await expect(page.locator("[data-progression-step-select]")).toHaveCount(4);
}

async function setProgressionView(page: Page, view: (typeof VIEWS)[number]): Promise<void> {
  await page.getByTestId("view-menu-toggle").click();
  const menu = page.getByRole("menu", { name: "View menu" });
  await menu.getByTestId(`progression-card-view-${view}`).click();
  await expect(page.getByTestId(`progression-view-btn-${view}`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

async function selectFirstTwoSteps(page: Page, view: (typeof VIEWS)[number]): Promise<void> {
  if (view === "piano-roll") {
    const chords = page.getByTestId("piano-roll-chord");
    await expect(chords).toHaveCount(4);
    await chords.nth(0).click();
    await chords.nth(1).click({ modifiers: ["Shift"] });
  } else {
    const steps = page.locator("[data-progression-step-select]");
    await expect(steps).toHaveCount(4);
    await steps.nth(0).click();
    await steps.nth(1).click({ modifiers: ["Shift"] });
  }
  await expect(page.getByTestId("range-selection-toolbar")).toContainText("2 selected");
}

async function applySemitoneDraft(page: Page, semitones: number): Promise<void> {
  await page.getByTestId("range-toolbar-transpose").click();
  const dialog = page.getByTestId("range-transposition-dialog");
  await expect(dialog).toBeVisible();
  await page.getByTestId("range-transposition-semitones").fill(String(semitones));
  await expect(page.getByTestId("range-transposition-preview")).toContainText(
    `Apply ${semitones > 0 ? "+" : ""}${semitones} semitones to 2 selected Steps`,
  );
  await expect(page.getByTestId("range-transposition-apply")).toBeEnabled();
  await page.getByTestId("range-transposition-apply").click();
  await expect(dialog).toHaveCount(0);
}

function projectWithOwnerOffsets(
  projectId: string,
  offsets: Readonly<Record<string, number>>,
): Project {
  const source = createPianoRollSystemChordFixture(projectId);
  return Object.freeze({
    ...source,
    progression: Object.freeze({
      ...source.progression,
      steps: Object.freeze(
        source.progression.steps.map((step) =>
          offsets[step.id] === undefined
            ? step
            : Object.freeze({ ...step, transpositionSemitones: offsets[step.id] }),
        ),
      ),
    }),
  });
}

async function importPortableProject(page: Page, project: Project): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: `${project.id}.cadenceflow`,
    mimeType: "application/json",
    buffer: Buffer.from(encodePortableProject(project), "utf8"),
  });
  await page.keyboard.press("Escape");
  const pianoRollView = page.getByTestId("progression-view-btn-piano-roll");
  if ((await pianoRollView.getAttribute("aria-pressed")) !== "true")
    await setProgressionView(page, "piano-roll");
  await expect(pianoRollView).toHaveAttribute("aria-pressed", "true");
}

async function exportPortableProject(page: Page): Promise<string> {
  const toggle = page.getByTestId("export-menu-toggle");
  if ((await toggle.getAttribute("aria-expanded")) === "true") await toggle.click();
  const downloadPromise = page.waitForEvent("download");
  await toggle.click();
  const menu = page.getByRole("menu", { name: "Export menu" });
  await expect(menu).toBeVisible();
  await menu.getByTestId("project-export-btn").click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Portable export did not provide a local file");
  const text = await readFile(path, "utf8");
  if ((await toggle.getAttribute("aria-expanded")) === "true") await toggle.click();
  return text;
}

function withoutProjectSelectionAndTimestamp(text: string): unknown {
  const project = JSON.parse(text) as Record<string, unknown>;
  delete project.updatedAt;
  const progression = project.progression;
  if (progression && typeof progression === "object" && !Array.isArray(progression))
    delete (progression as Record<string, unknown>).selectedStepId;
  return project;
}

async function editHistory(page: Page, action: "Undo" | "Redo"): Promise<void> {
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) })
    .click();
}

async function installTranspositionMidiMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (
      window as Window & { __CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__ = true;
    type MidiListener = (event: { readonly data: Uint8Array }) => void;
    const listeners = new Set<MidiListener>();
    const input = {
      id: "t212-midi-input",
      name: "T212 MIDI Input",
      manufacturer: "CadenceFlow Test",
      state: "connected",
      addEventListener: (_type: "midimessage", listener: MidiListener) => listeners.add(listener),
      removeEventListener: (_type: "midimessage", listener: MidiListener) =>
        listeners.delete(listener),
    };
    const stateListeners = new Set<() => void>();
    const access = {
      inputs: new Map([[input.id, input]]),
      addEventListener: (_type: "statechange", listener: () => void) =>
        stateListeners.add(listener),
      removeEventListener: (_type: "statechange", listener: () => void) =>
        stateListeners.delete(listener),
    };
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: { query: async () => ({ state: "prompt" }) },
    });
    Object.defineProperty(navigator, "requestMIDIAccess", {
      configurable: true,
      value: async () => access,
    });
    (
      window as Window & { __t212MidiMock?: { emit(data: readonly number[]): void } }
    ).__t212MidiMock = {
      emit: (data) => {
        const event = { data: Uint8Array.from(data) };
        for (const listener of listeners) listener(event);
      },
    };
  });
}

test.describe("T212 selected-range transposition", () => {
  test("mocked MIDI insertion stores source pitch under a nonzero owner offset and survives save/reopen", async ({
    page,
  }) => {
    await installTranspositionMidiMock(page);
    const project = projectWithOwnerOffsets("t212-midi-owner-offset", { "chord-a": 2 });
    await importPortableProject(page, project);
    await page.getByRole("button", { name: "Midi Settings", exact: true }).click();
    const midi = page.getByTestId("piano-roll-midi-step-input");
    await expect(midi).toBeVisible();
    await midi.getByRole("button", { name: "Connect MIDI" }).click();
    await expect(midi).toHaveAttribute("data-midi-status", "connected");
    const soundOnInput = midi.getByRole("checkbox", { name: "Sound on input" });
    if (await soundOnInput.isChecked()) await soundOnInput.uncheck();
    await midi.getByLabel("MIDI insertion cursor beat as a fraction").fill("1/4");
    await midi.getByRole("button", { name: "Set", exact: true }).click();
    if ((await midi.getAttribute("data-midi-armed")) !== "true")
      await midi.getByRole("button", { name: "Arm", exact: true }).click();
    await expect(midi).toHaveAttribute("data-midi-armed", "true");
    await page.evaluate(() => {
      (
        window as Window & { __t212MidiMock?: { emit(data: readonly number[]): void } }
      ).__t212MidiMock?.emit([0x90, 67, 96]);
    });

    const inserted = page.locator(
      '.piano-roll-note[data-source-step-id="chord-a"][data-pitch-midi="67"][data-start-beats="1/4"]',
    );
    await expect(inserted).toHaveCount(1);
    const noteId = await inserted.getAttribute("data-piano-roll-event-key");
    expect(noteId).toBeTruthy();
    const savedText = await exportPortableProject(page);
    const saved = decodePortableProject(savedText);
    const owner = saved.progression.steps.find((step) => step.id === "chord-a");
    const note =
      owner?.kind === "chord" && owner.melody?.mode === "authored"
        ? owner.melody.phrase.notes.find((event) => event.id === noteId)
        : undefined;
    expect(owner?.transpositionSemitones).toBe(2);
    expect(note?.pitch.midiNumber).toBe(65);
    expect(
      createEffectiveMelodyTimeline(saved).find((event) => event.eventKey === noteId)?.pitch
        .midiNumber,
    ).toBe(67);
    await expect
      .poll(
        () =>
          page.evaluate((expectedNoteId) => {
            const hooks = (
              window as Window & {
                __cadenceflow_persistence__?: { lastCompletedProjectSnapshot: string };
              }
            ).__cadenceflow_persistence__;
            if (!hooks?.lastCompletedProjectSnapshot) return false;
            const autosaved = JSON.parse(hooks.lastCompletedProjectSnapshot) as Project;
            return autosaved.progression.steps.some((step) => {
              const phrase =
                step.kind === "rest"
                  ? step.authoredMelody
                  : step.melody?.mode === "authored"
                    ? step.melody.phrase
                    : undefined;
              return phrase?.notes.some((note) => note.id === expectedNoteId) ?? false;
            });
          }, noteId),
        { timeout: 20_000 },
      )
      .toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    const pianoRollView = page.getByTestId("progression-view-btn-piano-roll");
    if ((await pianoRollView.getAttribute("aria-pressed")) !== "true")
      await setProgressionView(page, "piano-roll");
    await expect(pianoRollView).toHaveAttribute("aria-pressed", "true");
    const reopenedText = await exportPortableProject(page);
    const reopened = decodePortableProject(reopenedText);
    expect(
      reopened.progression.steps.find((step) => step.id === "chord-a")?.transpositionSemitones,
    ).toBe(2);
    expect(
      createEffectiveMelodyTimeline(reopened).find((event) => event.eventKey === noteId)?.pitch
        .midiNumber,
    ).toBe(67);
  });

  test("clipboard paste across different owner offsets preserves concert pitch through undo and reopen", async ({
    page,
  }) => {
    const project = projectWithOwnerOffsets("t212-clipboard-owner-offsets", {
      "chord-a": 2,
      "chord-b": -3,
    });
    await importPortableProject(page, project);
    const beforePaste = await exportPortableProject(page);
    const copied = page.locator(
      '.piano-roll-note[data-source-step-id="chord-a"][data-piano-roll-event-key="cross-system-carry"]',
    );
    await expect(copied.first()).toHaveCount(1);
    expect(await copied.first().getAttribute("data-pitch-midi")).toBe("66");
    await copied.first().click();
    await page.keyboard.press("Control+c");
    const destinationGrid = page.locator(".piano-roll-grid").nth(1);
    const destinationBounds = await destinationGrid.boundingBox();
    if (!destinationBounds) throw new Error("The second Measure grid is not visible");
    await page.mouse.click(
      destinationBounds.x + destinationBounds.width / 4,
      destinationBounds.y + 2,
    );
    await expect(page.getByTestId("piano-roll-midi-cursor").first()).toHaveAttribute(
      "data-start-beats",
      "5/1",
    );
    await page.keyboard.press("Control+v");

    const pasted = page.locator(
      '.piano-roll-note[data-source-step-id="chord-b"][data-pitch-midi="66"][data-start-beats="5/1"]',
    );
    await expect(pasted).toHaveCount(1);
    const noteId = await pasted.getAttribute("data-piano-roll-event-key");
    expect(noteId).toBeTruthy();
    const afterPaste = decodePortableProject(await exportPortableProject(page));
    const destination = afterPaste.progression.steps.find((step) => step.id === "chord-b");
    const stored =
      destination?.kind === "chord" && destination.melody?.mode === "authored"
        ? destination.melody.phrase.notes.find((note) => note.id === noteId)
        : undefined;
    expect(destination?.transpositionSemitones).toBe(-3);
    expect(stored?.pitch.midiNumber).toBe(69);
    expect(
      createEffectiveMelodyTimeline(afterPaste).find((event) => event.eventKey === noteId),
    ).toMatchObject({ sourceStepId: "chord-b", pitch: { midiNumber: 66 } });

    await editHistory(page, "Undo");
    expect(withoutProjectSelectionAndTimestamp(await exportPortableProject(page))).toEqual(
      withoutProjectSelectionAndTimestamp(beforePaste),
    );
    await editHistory(page, "Redo");
    const reopenedPayload = await exportPortableProject(page);
    await importPortableProject(page, decodePortableProject(reopenedPayload));
    const reopened = decodePortableProject(await exportPortableProject(page));
    expect(
      createEffectiveMelodyTimeline(reopened).find((event) => event.eventKey === noteId),
    ).toMatchObject({ sourceStepId: "chord-b", pitch: { midiNumber: 66 } });
  });

  test("Cancel and Escape keep the selected harmony unchanged; Apply transposes only selected Steps", async ({
    page,
  }) => {
    await createFourStepProgression(page);
    await selectFirstTwoSteps(page, "harmonic");
    const originalText = await page
      .locator("[data-progression-step-select]")
      .evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim()));

    await page.getByTestId("range-toolbar-transpose").click();
    const input = page.getByTestId("range-transposition-semitones");
    await expect(input).toBeFocused();
    await input.fill("2");
    await expect(page.getByTestId("range-transposition-preview")).toContainText("+2 semitones");
    await page.getByTestId("range-transposition-cancel").click();
    await expect(page.getByTestId("range-transposition-dialog")).toHaveCount(0);
    await expect(page.locator("[data-progression-step-select]")).toHaveCount(4);
    expect(
      await page
        .locator("[data-progression-step-select]")
        .evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim())),
    ).toEqual(originalText);

    await page.getByTestId("range-toolbar-transpose").click();
    await expect(input).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("range-transposition-dialog")).toHaveCount(0);
    await expect(page.getByTestId("range-toolbar-transpose")).toBeFocused();
    expect(
      await page
        .locator("[data-progression-step-select]")
        .evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim())),
    ).toEqual(originalText);

    await page.getByTestId("range-toolbar-transpose").click();
    await page.getByTestId("range-transposition-semitones").fill("2");
    await page.getByTestId("range-transposition-apply").click();
    await expect(page.getByTestId("range-transposition-dialog")).toHaveCount(0);
    await expect(page.getByTestId("range-toolbar-transpose")).toBeFocused();
    await expect(page.getByRole("alert")).toHaveCount(0);
    const selectedSteps = page.locator("[data-progression-step-select][aria-pressed='true']");
    await expect(selectedSteps).toHaveCount(2);
    await expect(selectedSteps.filter({ hasText: "+2 st" })).toHaveCount(2);
    await expect(page.locator("[data-progression-step-select]").nth(2)).not.toContainText("+2 st");
    await page.getByTestId("edit-menu-toggle").click();
    await page
      .getByRole("menu", { name: "Edit menu" })
      .getByRole("menuitem", { name: /Undo/ })
      .click();
    await expect(selectedSteps.filter({ hasText: "+2 st" })).toHaveCount(0);
    await page.getByTestId("edit-menu-toggle").click();
    await page
      .getByRole("menu", { name: "Edit menu" })
      .getByRole("menuitem", { name: /Redo/ })
      .click();
    await expect(selectedSteps.filter({ hasText: "+2 st" })).toHaveCount(2);
  });

  test("uses the same selected range and local pitch marker in all six progression views", async ({
    page,
  }) => {
    await createFourStepProgression(page);
    for (const view of VIEWS) {
      await setProgressionView(page, view);
      await selectFirstTwoSteps(page, view);
      await applySemitoneDraft(page, 1);
      const cumulativeOffset = VIEWS.indexOf(view) + 1;
      if (view === "staff" || view === "tablature") {
        await expect(page.getByTestId("progression-score-systems")).toContainText(
          `local transposition +${cumulativeOffset} semitones`,
        );
      } else if (view === "piano-roll") {
        await expect(
          page.getByTestId("piano-roll-chord").filter({ hasText: `+${cumulativeOffset} st` }),
        ).toHaveCount(2);
      } else {
        await expect(
          page.locator("[data-progression-step-select][aria-pressed='true']").filter({
            hasText: `+${cumulativeOffset} st`,
          }),
        ).toHaveCount(2);
      }
      await expect(page.getByTestId("range-selection-toolbar")).toContainText("2 selected");
    }
  });

  test("captures the open range editor at normal sizes in both themes", async ({ page }) => {
    test.setTimeout(120_000);
    await createFourStepProgression(page);
    await selectFirstTwoSteps(page, "harmonic");
    await page.getByTestId("range-toolbar-transpose").click();
    await page.getByTestId("range-transposition-semitones").fill("2");
    await mkdir(SCREENSHOT_DIRECTORY, { recursive: true });

    const themes = page.getByRole("group", { name: "Theme" });
    for (const viewport of [
      { width: 640, height: 360 },
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      for (const theme of ["dark", "light"] as const) {
        await themes
          .getByRole("button", { name: `${theme === "dark" ? "Dark" : "Light"} theme` })
          .click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const dialog = page.getByTestId("range-transposition-dialog");
        await expect(dialog).toBeVisible();
        const bounds = await dialog.boundingBox();
        const headerBounds = await page.locator(".app-header").boundingBox();
        expect(bounds).not.toBeNull();
        expect(headerBounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(-1);
        expect(bounds!.y).toBeGreaterThanOrEqual(-1);
        expect(bounds!.y).toBeGreaterThanOrEqual(headerBounds!.y + headerBounds!.height - 1);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
        if (viewport.width === 640) {
          const contentSize = await dialog.evaluate((element) => ({
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
          }));
          expect(contentSize.scrollHeight).toBeLessThanOrEqual(contentSize.clientHeight + 1);
          const input = page.getByTestId("range-transposition-semitones");
          await expect(input).toBeInViewport();
          await input.click();
          await expect(input).toBeFocused();
        }
        await page.screenshot({
          path: join(
            SCREENSHOT_DIRECTORY,
            `range-editor-${viewport.width}x${viewport.height}-${theme}.png`,
          ),
          fullPage: false,
        });
      }
    }
  });
});
