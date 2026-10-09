import { requireValue } from "../fixtures/assertions";
import { mkdir, readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createEffectiveMelodyTimeline } from "../../src/domain/melody/effectiveTimeline";
import type { Project } from "../../src/domain/project/project";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../src/persistence/portableProject";
import { createPianoRollSystemChordFixture } from "../fixtures/piano-roll-system-chord.fixture";

interface MidiMockOptions {
  readonly inputCount: number;
  readonly permission?: "allow" | "deny" | "unsupported";
  readonly permissionState?: "granted" | "prompt" | "denied";
  readonly delayQuery?: boolean;
}

async function installMidiMock(page: Page, options: MidiMockOptions): Promise<void> {
  await page.addInitScript((config: MidiMockOptions) => {
    type MessageListener = (event: { readonly data: Uint8Array }) => void;
    type StateListener = () => void;
    const inputListeners = new Map<string, Set<MessageListener>>();
    const stateListeners = new Set<StateListener>();
    const inputs = new Map<
      string,
      {
        id: string;
        name: string;
        manufacturer: string;
        state: "connected" | "disconnected";
        addEventListener: (type: "midimessage", listener: MessageListener) => void;
        removeEventListener: (type: "midimessage", listener: MessageListener) => void;
      }
    >();
    for (let index = 0; index < config.inputCount; index += 1) {
      const id = `mock-midi-${index + 1}`;
      inputListeners.set(id, new Set());
      inputs.set(id, {
        id,
        name: `Mock Keyboard ${index + 1}`,
        manufacturer: "CadenceFlow Test",
        state: "connected",
        addEventListener: (_type, listener) => inputListeners.get(id)?.add(listener),
        removeEventListener: (_type, listener) => inputListeners.get(id)?.delete(listener),
      });
    }
    const access = {
      inputs,
      addEventListener: (_type: "statechange", listener: StateListener) =>
        stateListeners.add(listener),
      removeEventListener: (_type: "statechange", listener: StateListener) =>
        stateListeners.delete(listener),
    };
    const target = window as Window & {
      __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean;
      __midiMock?: {
        readonly accessOptions: { sysex: false } | null;
        emit(data: readonly number[], inputId?: string): void;
        disconnect(inputId?: string): void;
      };
    };
    target.__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: {
        query: async () => {
          if (!config.delayQuery) return { state: config.permissionState ?? "prompt" };
          return new Promise((resolve) => {
            (window as unknown as { __midiPermissionResolve: () => void }).__midiPermissionResolve =
              () => resolve({ state: config.permissionState ?? "prompt" });
          });
        },
      },
    });
    const midiMock = {
      accessOptions: null as { sysex: false } | null,
      requests: 0,
      listenerCount(inputId = "mock-midi-1") {
        return inputListeners.get(inputId)?.size ?? 0;
      },
      hotplug(inputId = "mock-midi-1") {
        const listeners = inputListeners.get(inputId) ?? new Set<MessageListener>();
        inputListeners.set(inputId, listeners);
        inputs.set(inputId, {
          id: inputId,
          name: `Hotplug ${inputId}`,
          manufacturer: "Test",
          state: "connected",
          addEventListener: (_type, listener) => listeners.add(listener),
          removeEventListener: (_type, listener) => listeners.delete(listener),
        });
        for (const listener of stateListeners) listener();
      },
      emit(data: readonly number[], inputId = "mock-midi-1") {
        const bytes = Uint8Array.from(data);
        for (const listener of inputListeners.get(inputId) ?? []) listener({ data: bytes });
      },
      disconnect(inputId = "mock-midi-1") {
        const input = inputs.get(inputId);
        if (!input) return;
        input.state = "disconnected";
        inputs.delete(inputId);
        for (const listener of stateListeners) listener();
      },
    };
    target.__midiMock = midiMock;
    if (config.permission === "unsupported") {
      Object.defineProperty(navigator, "requestMIDIAccess", {
        configurable: true,
        value: undefined,
      });
      return;
    }
    Object.defineProperty(navigator, "requestMIDIAccess", {
      configurable: true,
      value: async (accessOptions: { sysex: boolean }) => {
        midiMock.requests += 1;
        midiMock.accessOptions = { sysex: accessOptions.sysex as false };
        if (config.permission === "deny")
          throw Object.assign(new Error("MIDI permission was denied"), { name: "NotAllowedError" });
        return access;
      },
    });
  }, options);
}

async function openStudio(page: Page, project: Project): Promise<string> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });
  const text = encodePortableProject(project);
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: `${project.id}.cadenceflow`,
    mimeType: "application/json",
    buffer: Buffer.from(text, "utf8"),
  });
  await expect(page.getByTestId("progression-view-btn-piano-roll")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Midi Settings", exact: true }).click();
  await expect(page.getByTestId("piano-roll-midi-step-input")).toBeVisible();
  return text;
}

async function exportProjectText(page: Page): Promise<string> {
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

async function historyAction(page: Page, action: "Undo" | "Redo"): Promise<void> {
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) })
    .click();
}

async function armMidi(page: Page): Promise<void> {
  const entry = page.getByRole("button", { name: "Midi Settings", exact: true });
  if ((await entry.getAttribute("aria-expanded")) === "false") await entry.click();
  const midi = page.getByTestId("piano-roll-midi-step-input");
  if ((await midi.getAttribute("data-midi-armed")) !== "true")
    await midi.getByRole("button", { name: "Arm", exact: true }).click();
}

test("mocked Note On inserts one exact authored note, advances without resnapping, and undoes once", async ({
  page,
}) => {
  await installMidiMock(page, { inputCount: 1 });
  await openStudio(page, createPianoRollSystemChordFixture("t210-midi-exact"));
  await exportProjectText(page);
  const midi = page.getByTestId("piano-roll-midi-step-input");
  await midi.getByRole("button", { name: "Connect MIDI" }).click();
  await expect(midi).toHaveAttribute("data-midi-status", "connected");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __midiMock?: { accessOptions: unknown } }).__midiMock
            ?.accessOptions,
      ),
    )
    .toEqual({ sysex: false });
  await midi.getByRole("checkbox", { name: "Sound on input" }).uncheck();
  await midi.getByLabel("MIDI step duration").selectOption("sixteenth-triplet");
  await midi.getByLabel("MIDI insertion cursor beat as a fraction").fill("1/3");
  await midi.getByRole("button", { name: "Set", exact: true }).click();
  await armMidi(page);
  const notes = page.getByTestId("piano-roll-note");
  const originalCount = await notes.count();
  for (const data of [
    [0x80, 60, 80],
    [0x90, 60, 0],
    [0xb0, 60, 80],
    [0xe0, 60, 80],
  ])
    await page.evaluate((message) => {
      (
        window as Window & { __midiMock?: { emit(data: readonly number[]): void } }
      ).__midiMock?.emit(message);
    }, data);
  expect(await notes.count()).toBe(originalCount);
  await page.evaluate(() => {
    (window as Window & { __midiMock?: { emit(data: readonly number[]): void } }).__midiMock?.emit([
      0x9f, 61, 90,
    ]);
  });
  const inserted = page.locator('.piano-roll-note[data-pitch-midi="61"]');
  await expect(inserted).toHaveAttribute("data-start-beats", "1/3");
  await expect(inserted).toHaveAttribute("data-duration-beats", "1/6");
  await expect(inserted).toHaveAttribute("data-pitch-spelling", "C#");
  await expect(midi).toHaveAttribute("data-cursor", "1/2");
  const after = await exportProjectText(page);
  const saved = decodePortableProject(after);
  const ownerId = await inserted.getAttribute("data-source-step-id");
  expect(ownerId).toBeTruthy();
  const owner = saved.progression.steps.find((step) => step.id === ownerId);
  expect(owner?.kind).toBe("chord");
  if (owner?.kind !== "chord" || owner.melody?.mode !== "authored")
    throw new Error("MIDI step input did not author a note in the owning Step");
  expect(owner.melody.phrase.notes).toContainEqual(
    expect.objectContaining({
      pitch: expect.objectContaining({ midiNumber: 61 }),
      onset: { numerator: 1, denominator: 3 },
      duration: { numerator: 1, denominator: 6 },
    }),
  );
  const afterFirst = after;
  await armMidi(page);
  await page.evaluate(() => {
    const mock = (
      window as Window & {
        __midiMock?: { emit(data: readonly number[]): void };
      }
    ).__midiMock;
    mock?.emit([0x90, 62, 85]);
    mock?.emit([0x91, 63, 85]);
  });
  const burstFirst = page.locator('.piano-roll-note[data-pitch-midi="62"]');
  const burstSecond = page.locator('.piano-roll-note[data-pitch-midi="63"]');
  await expect(burstFirst).toHaveAttribute("data-start-beats", "1/2");
  await expect(burstSecond).toHaveAttribute("data-start-beats", "2/3");
  await expect(midi).toHaveAttribute("data-cursor", "5/6");
  const afterBurst = await exportProjectText(page);
  await historyAction(page, "Undo");
  const oneBurstNoteUndone = decodePortableProject(await exportProjectText(page));
  const oneBurstNoteSignature = createEffectiveMelodyTimeline(oneBurstNoteUndone)
    .filter((event) => event.pitch.midiNumber >= 61 && event.pitch.midiNumber <= 63)
    .map((event) => event.pitch.midiNumber);
  expect(oneBurstNoteSignature).toEqual([61, 62]);
  await historyAction(page, "Undo");
  expect(await exportProjectText(page)).toBe(afterFirst);
  await historyAction(page, "Redo");
  await historyAction(page, "Redo");
  expect(await exportProjectText(page)).toBe(afterBurst);
});

test("manual MIDI fallback works after permission denial and rejects overflow without mutation", async ({
  page,
}) => {
  await installMidiMock(page, { inputCount: 0, permission: "deny" });
  await openStudio(page, createPianoRollSystemChordFixture("t210-midi-denied"));
  const before = await exportProjectText(page);
  const midi = page.getByTestId("piano-roll-midi-step-input");
  await midi.getByRole("button", { name: "Connect MIDI", exact: true }).click();
  await expect(midi).toHaveAttribute("data-midi-status", "permission-denied");
  await midi.getByRole("checkbox", { name: "Sound on input" }).uncheck();
  await midi.getByLabel("MIDI insertion cursor beat as a fraction").fill("1/9007199254740991");
  await midi.getByRole("button", { name: "Set", exact: true }).click();
  await midi.getByRole("button", { name: "Insert MIDI pitch 60" }).click();
  await expect(midi.getByRole("status")).toContainText("safe integer");
  await expect(midi).toHaveAttribute("data-cursor", "1/9007199254740991");
  expect(await exportProjectText(page)).toBe(before);
  await midi.getByLabel("MIDI insertion cursor beat as a fraction").fill("47/2");
  await midi.getByRole("button", { name: "Set", exact: true }).click();
  await midi.getByLabel("Manual MIDI pitch").fill("127");
  await midi.getByRole("button", { name: "Insert MIDI pitch 127" }).click();
  await expect(midi.getByRole("status")).toContainText("must fit inside the current composition");
  expect(await exportProjectText(page)).toBe(before);
  await midi.getByLabel("MIDI step duration").selectOption("sixteenth");
  await midi.getByRole("button", { name: "Insert MIDI pitch 127" }).click();
  const note = page.locator('.piano-roll-note[data-pitch-midi="127"]');
  await expect(note).toHaveAttribute("data-start-beats", "47/2");
  await expect(note).toHaveAttribute("data-duration-beats", "1/4");
  await expect(note).toHaveAttribute("data-source-step-id", "chord-f");
  expect(await exportProjectText(page)).not.toBe(before);
});

test("exact step input crosses Step and bar cuts and materializes generated Melody once", async ({
  page,
}) => {
  await openStudio(page, createPianoRollSystemChordFixture("t210-midi-boundaries"));
  const midi = page.getByTestId("piano-roll-midi-step-input");
  await midi.getByRole("checkbox", { name: "Sound on input" }).uncheck();
  const before = await exportProjectText(page);
  const original = decodePortableProject(before);
  const generatedSignature = createEffectiveMelodyTimeline(original)
    .filter((event) => event.sourceStepId === "generated-e")
    .map((event) => [
      event.pitch.midiNumber,
      `${event.startBeats.numerator}/${event.startBeats.denominator}`,
      `${event.durationBeats.numerator}/${event.durationBeats.denominator}`,
    ])
    .sort((left, right) => left.join(":").localeCompare(right.join(":")));

  await midi.getByLabel("MIDI step duration").selectOption("quarter-dotted");
  await midi.getByLabel("MIDI insertion cursor beat as a fraction").fill("7");
  await midi.getByRole("button", { name: "Set", exact: true }).click();
  await midi.getByLabel("Manual MIDI pitch").fill("66");
  await midi.getByRole("button", { name: "Insert MIDI pitch 66" }).click();
  const crossing = page.locator('.piano-roll-note[data-pitch-midi="66"]');
  await expect(crossing).toHaveCount(2);
  await expect(crossing.first()).toHaveAttribute("data-start-beats", "7/1");
  await expect(crossing.first()).toHaveAttribute("data-duration-beats", "3/2");
  await expect(crossing.nth(0)).toHaveAttribute("data-fragment-start-beats", "7/1");
  await expect(crossing.nth(1)).toHaveAttribute("data-fragment-start-beats", "8/1");
  await expect(crossing.first()).toHaveAttribute("data-source-step-id", "chord-b");

  const afterCrossing = await exportProjectText(page);
  await midi.getByLabel("MIDI step duration").selectOption("quarter");
  await midi.getByLabel("MIDI insertion cursor beat as a fraction").fill("16");
  await midi.getByRole("button", { name: "Set", exact: true }).click();
  await midi.getByLabel("Manual MIDI pitch").fill("67");
  await midi.getByRole("button", { name: "Insert MIDI pitch 67" }).click();
  const generatedInsert = page.locator(
    '.piano-roll-note[data-pitch-midi="67"][data-source-step-id="generated-e"]',
  );
  await expect(generatedInsert).toHaveAttribute("data-start-beats", "16/1");
  const insertedEventKey = await generatedInsert.getAttribute("data-piano-roll-event-key");
  await expect(generatedInsert).toHaveAttribute("data-generated", "false");
  const after = await exportProjectText(page);
  const materialized = decodePortableProject(after);
  const generatedStep = materialized.progression.steps.find((step) => step.id === "generated-e");
  expect(generatedStep?.kind).toBe("chord");
  if (generatedStep?.kind !== "chord" || generatedStep.melody?.mode !== "authored")
    throw new Error("Generated destination was not materialized into authored Melody");
  const originalGeneratedStep = original.progression.steps.find(
    (step) => step.id === "generated-e",
  );
  if (originalGeneratedStep?.kind !== "chord" || originalGeneratedStep.melody?.mode !== "generated")
    throw new Error("Missing source generated recipe");
  expect(generatedStep.melody.sourceRecipe).toEqual(originalGeneratedStep.melody.recipe);
  const retainedGeneratedSignature = createEffectiveMelodyTimeline(materialized)
    .filter((event) => event.sourceStepId === "generated-e" && event.eventKey !== insertedEventKey)
    .map((event) => [
      event.pitch.midiNumber,
      `${event.startBeats.numerator}/${event.startBeats.denominator}`,
      `${event.durationBeats.numerator}/${event.durationBeats.denominator}`,
    ])
    .sort((left, right) => left.join(":").localeCompare(right.join(":")));
  expect(retainedGeneratedSignature).toEqual(generatedSignature);

  await historyAction(page, "Undo");
  expect(await exportProjectText(page)).toBe(afterCrossing);
  await historyAction(page, "Redo");
  expect(await exportProjectText(page)).toBe(after);

  await midi.getByLabel("MIDI step duration").selectOption("quarter");
  await midi.getByLabel("MIDI insertion cursor beat as a fraction").fill("12");
  await midi.getByRole("button", { name: "Set", exact: true }).click();
  await midi.getByLabel("Manual MIDI pitch").fill("68");
  await midi.getByRole("button", { name: "Insert MIDI pitch 68" }).click();
  const withRestNote = decodePortableProject(await exportProjectText(page));
  const rested = withRestNote.progression.steps.find((step) => step.id === "rest-d");
  expect(rested?.kind).toBe("rest");
  if (rested?.kind !== "rest") throw new Error("MIDI insertion did not target the Rest Step");
  expect(rested.authoredMelody?.notes).toContainEqual(
    expect.objectContaining({
      pitch: expect.objectContaining({ midiNumber: 68 }),
      onset: { numerator: 0, denominator: 1 },
      duration: { numerator: 1, denominator: 1 },
    }),
  );
});

test("device selection, Escape, disconnect, and view changes disarm MIDI input", async ({
  page,
}) => {
  await installMidiMock(page, { inputCount: 2 });
  await openStudio(page, createPianoRollSystemChordFixture("t210-midi-lifecycle"));
  const midi = page.getByTestId("piano-roll-midi-step-input");
  await midi.getByRole("button", { name: "Connect MIDI", exact: true }).click();
  await expect(midi).toHaveAttribute("data-midi-status", "connected");
  const device = midi.getByLabel("MIDI input device");
  await device.selectOption("mock-midi-1");
  await armMidi(page);
  await expect(midi).toHaveAttribute("data-midi-armed", "true");
  await device.selectOption("mock-midi-2");
  await expect(midi).toHaveAttribute("data-midi-armed", "false");
  await armMidi(page);
  await page.keyboard.press("Escape");
  await expect(midi).toHaveAttribute("data-midi-armed", "false");
  await armMidi(page);
  await page.evaluate(() => {
    (
      window as Window & { __midiMock?: { disconnect(inputId?: string): void } }
    ).__midiMock?.disconnect("mock-midi-2");
  });
  await expect(midi).toHaveAttribute("data-midi-armed", "false");
  await expect(page.locator("#midi-status-content")).toContainText("disconnected");
  await midi.getByRole("button", { name: "Connect MIDI", exact: true }).click();
  await expect(midi).toHaveAttribute("data-midi-status", "connected");
  await device.selectOption("mock-midi-1");
  await armMidi(page);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(midi).toHaveAttribute("data-midi-armed", "true");
  await expect(page.locator("#midi-status-content")).toContainText("temporarily paused");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByTestId("progression-view-btn-tablature").click();
  await page.getByTestId("progression-view-btn-piano-roll").click();
  await expect(midi).toHaveAttribute("data-midi-armed", "false");
});

test("unsupported MIDI still exposes manual pitch entry", async ({ page }) => {
  await installMidiMock(page, { inputCount: 0, permission: "unsupported" });
  await openStudio(page, createPianoRollSystemChordFixture("t210-midi-unsupported"));
  const midi = page.getByTestId("piano-roll-midi-step-input");
  await midi.getByRole("button", { name: "Connect MIDI", exact: true }).click();
  await expect(midi).toHaveAttribute("data-midi-status", "unsupported");
  await midi.getByRole("checkbox", { name: "Sound on input" }).uncheck();
  await midi.getByLabel("Manual MIDI pitch").fill("0");
  await midi.getByRole("button", { name: "Insert MIDI pitch 0" }).click();
  await expect(page.locator('.piano-roll-note[data-pitch-midi="0"]')).toHaveCount(1);
});

test("Enter uses manual pitch only while armed and keeps the ordinary unarmed key path", async ({
  page,
}) => {
  await installMidiMock(page, { inputCount: 1 });
  await openStudio(page, createPianoRollSystemChordFixture("t210-midi-enter"));
  const midi = page.getByTestId("piano-roll-midi-step-input");
  await midi.getByRole("button", { name: "Connect MIDI", exact: true }).click();
  await midi.getByRole("checkbox", { name: "Sound on input" }).uncheck();
  const pitch = midi.getByLabel("Manual MIDI pitch");
  await pitch.fill("14");
  await armMidi(page);
  await pitch.press("Enter");
  await expect(page.locator('.piano-roll-note[data-pitch-midi="14"]')).toHaveCount(1);
  await midi.getByRole("button", { name: "Disarm", exact: true }).click();
  await pitch.fill("15");
  await pitch.press("Enter");
  await expect(page.locator('.piano-roll-note[data-pitch-midi="15"]')).toHaveCount(0);
  await armMidi(page);
  await page.getByLabel("Melody grid, measure 1").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('.piano-roll-note[data-pitch-midi="15"]')).toHaveCount(1);
  await expect(midi).toHaveAttribute("data-cursor", "2/1");
});

test("empty-grid placement updates the shared cursor at the selected Snap", async ({ page }) => {
  await openStudio(page, createPianoRollSystemChordFixture("t210-midi-snap"));
  const midi = page.getByTestId("piano-roll-midi-step-input");
  await page.getByLabel("Snap resolution").selectOption("1/8");
  const grid = page.getByRole("group", { name: "Melody grid, measure 1" });
  await grid.scrollIntoViewIfNeeded();
  const bounds = await grid.boundingBox();
  if (!bounds) throw new Error("The first Piano Roll grid is not visible");
  await page.mouse.click(bounds.x + bounds.width * 0.63, bounds.y + 2);
  await expect(midi).toHaveAttribute("data-cursor", "5/2");
});

for (const cancelAction of ["sound-off", "blur", "Escape"] as const) {
  test(`optional MIDI audition lasts 250 ms and ignores delayed prepare canceled by ${cancelAction}`, async ({
    page,
  }) => {
    await installMidiMock(page, { inputCount: 0, permission: "unsupported" });
    await openStudio(page, createPianoRollSystemChordFixture("t210-midi-audition"));
    const midi = page.getByTestId("piano-roll-midi-step-input");
    await page.evaluate(() => {
      type MockScheduledEvent = {
        readonly startSeconds: number;
        readonly durationSeconds: number;
        readonly channelRole: string;
        readonly pitch: number;
      };
      type MockProviderPrototype = {
        prepareForInstruments: (instruments: readonly string[]) => Promise<{
          ready: readonly string[];
          unavailable: readonly string[];
          failed: readonly string[];
        }>;
        schedulePreview: (events: readonly MockScheduledEvent[]) => { id: string; cancel(): void };
      };
      const target = window as Window & {
        __cadenceflow_audio__?: {
          MelodySoundFontProvider?: { prototype: MockProviderPrototype };
        };
        __midiPreparationResolve?: () => void;
        __midiPreviewEvents?: readonly MockScheduledEvent[];
      };
      const prototype = target.__cadenceflow_audio__?.MelodySoundFontProvider?.prototype;
      if (!prototype) throw new Error("The guarded Melody provider test hook is missing");
      prototype.prepareForInstruments = function (instruments) {
        const ready = [...instruments];
        if (!target.__midiPreparationResolve) {
          return new Promise((resolve) => {
            target.__midiPreparationResolve = () => {
              (this as unknown as { providerState: string }).providerState = "ready";
              resolve({ ready, unavailable: [], failed: [] });
            };
          });
        }
        (this as unknown as { providerState: string }).providerState = "ready";
        return Promise.resolve({ ready, unavailable: [], failed: [] });
      };
      prototype.schedulePreview = function (events) {
        target.__midiPreviewEvents = events.map((event) => ({ ...event }));
        return { id: "mock-midi-preview", cancel: () => undefined };
      };
    });
    await midi.getByLabel("Manual MIDI pitch").fill("62");
    await midi.getByRole("button", { name: "Insert MIDI pitch 62" }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(
            (window as Window & { __midiPreparationResolve?: () => void }).__midiPreparationResolve,
          ),
        ),
      )
      .toBe(true);
    if (cancelAction === "sound-off")
      await midi.getByRole("checkbox", { name: "Sound on input" }).uncheck();
    else if (cancelAction === "blur")
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else await page.keyboard.press("Escape");
    await page.evaluate(() => {
      (window as Window & { __midiPreparationResolve?: () => void }).__midiPreparationResolve?.();
    });
    await page.waitForTimeout(50);
    expect(
      await page.evaluate(
        () => (window as Window & { __midiPreviewEvents?: readonly unknown[] }).__midiPreviewEvents,
      ),
    ).toBeUndefined();

    if (cancelAction === "blur")
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const entry = page.getByRole("button", { name: "Midi Settings", exact: true });
    if ((await entry.getAttribute("aria-expanded")) === "false") await entry.click();
    await midi.getByRole("checkbox", { name: "Sound on input" }).check();
    await midi.getByLabel("Manual MIDI pitch").fill("63");
    await midi.getByRole("button", { name: "Insert MIDI pitch 63" }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { __midiPreviewEvents?: readonly unknown[] }).__midiPreviewEvents,
        ),
      )
      .toBeTruthy();
    const previewEvents = await page.evaluate(
      () =>
        (
          window as Window & {
            __midiPreviewEvents?: readonly {
              readonly startSeconds: number;
              readonly durationSeconds: number;
              readonly channelRole: string;
              readonly pitch: number;
            }[];
          }
        ).__midiPreviewEvents,
    );
    expect(previewEvents).toEqual([
      expect.objectContaining({
        startSeconds: 0,
        durationSeconds: 0.25,
        channelRole: "melody",
        pitch: 63,
      }),
    ]);
  });
}

test("granted startup connects and arms without a gesture; closed sidebar leaves only status", async ({
  page,
}) => {
  await installMidiMock(page, { inputCount: 2, permissionState: "granted" });
  await openStudio(page, createPianoRollSystemChordFixture("t210-startup"));
  await page.waitForTimeout(700);
  await page.reload();
  const status = page.locator("#midi-status-content");
  await expect(status).toContainText("Mock Keyboard 1");
  await expect(status).toContainText("Armed");
  await expect(page.getByTestId("piano-roll-midi-step-input")).toBeHidden();
  await expect(
    page.getByTestId("piano-roll-toolbar").getByRole("button", { name: /MIDI|Arm|Insert/ }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { __midiMock: { requests: number } }).__midiMock.requests,
    ),
  ).toBe(1);
  await page.getByRole("button", { name: "Midi Settings", exact: true }).click();
  await expect(page.getByTestId("piano-roll-midi-step-input")).toHaveAttribute(
    "data-midi-armed",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Midi Settings", exact: true })).toBeFocused();
  await expect(status).toContainText("Disarmed");
});

test("Escape during delayed startup permission query never revives cleared intent", async ({
  page,
}) => {
  await installMidiMock(page, { inputCount: 1, permissionState: "granted", delayQuery: true });
  await openStudio(page, createPianoRollSystemChordFixture("t210-late-query"));
  await page.waitForTimeout(700);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (window as unknown as { __midiPermissionResolve?: () => void }).__midiPermissionResolve,
        ),
      ),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    (window as unknown as { __midiPermissionResolve: () => void }).__midiPermissionResolve(),
  );
  await expect(page.locator("#midi-status-content")).toContainText("connected");
  await expect(page.locator("#midi-status-content")).toContainText("Disarmed");
  await page.evaluate(() =>
    (window as unknown as { __midiMock: { emit(data: number[]): void } }).__midiMock.emit([
      0x90, 16, 90,
    ]),
  );
  await expect(page.locator('.piano-roll-note[data-pitch-midi="16"]')).toHaveCount(0);
});

test("blur drops background input and resumes intent; Escape and view safety OFF never resume", async ({
  page,
}) => {
  await installMidiMock(page, { inputCount: 1 });
  await openStudio(page, createPianoRollSystemChordFixture("t210-focus"));
  const midi = page.getByTestId("piano-roll-midi-step-input");
  await midi.getByRole("button", { name: "Connect MIDI", exact: true }).click();
  await midi.getByRole("checkbox", { name: "Sound on input" }).uncheck();
  const emit = async (pitch: number) =>
    page.evaluate(
      (p) =>
        (window as unknown as { __midiMock: { emit(data: number[]): void } }).__midiMock.emit([
          0x90,
          p,
          100,
        ]),
      pitch,
    );
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await emit(17);
  await expect(page.locator('.piano-roll-note[data-pitch-midi="17"]')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await emit(18);
  await expect(page.locator('.piano-roll-note[data-pitch-midi="18"]')).toHaveCount(1);
  await expect(page.locator('.piano-roll-note[data-pitch-midi="17"]')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await emit(19);
  await expect(page.locator('.piano-roll-note[data-pitch-midi="19"]')).toHaveCount(0);
  await armMidi(page);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.getByTestId("progression-view-btn-tablature").click();
  await page.getByTestId("progression-view-btn-piano-roll").click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await emit(20);
  await expect(page.locator('.piano-roll-note[data-pitch-midi="20"]')).toHaveCount(0);
  await expect(midi).toHaveAttribute("data-midi-armed", "false");
});

test("manual OFF, transport and same-ID session replacement during blur prevent focus revival", async ({
  page,
}) => {
  await installMidiMock(page, { inputCount: 1 });
  const fixture = createPianoRollSystemChordFixture("t210-safety");
  await openStudio(page, fixture);
  const midi = page.getByTestId("piano-roll-midi-step-input");
  await midi.getByRole("button", { name: "Connect MIDI", exact: true }).click();
  await midi.getByRole("checkbox", { name: "Sound on input" }).uncheck();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await midi.getByRole("button", { name: "Disarm", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(midi).toHaveAttribute("data-midi-effective", "false");
  await armMidi(page);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByTestId("transport-status")).toContainText("Playing");
  await expect(midi).toHaveAttribute("data-midi-armed", "false");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(midi).toHaveAttribute("data-midi-effective", "false");
  await armMidi(page);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: `${fixture.id}.cadenceflow`,
    mimeType: "application/json",
    buffer: Buffer.from(encodePortableProject(fixture)),
  });
  await expect(midi).toHaveAttribute("data-midi-armed", "false");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(midi).toHaveAttribute("data-midi-effective", "false");
  await page.evaluate(() =>
    (window as unknown as { __midiMock: { emit(data: number[]): void } }).__midiMock.emit([
      0x90, 21, 90,
    ]),
  );
  await expect(page.locator('.piano-roll-note[data-pitch-midi="21"]')).toHaveCount(0);
});

test("hotplug activates once, switches detach old listeners, and manual OFF survives notifications", async ({
  page,
}) => {
  await installMidiMock(page, { inputCount: 0 });
  await openStudio(page, createPianoRollSystemChordFixture("t210-hotplug"));
  const midi = page.getByTestId("piano-roll-midi-step-input");
  expect(
    await page.evaluate(
      () => (window as unknown as { __midiMock: { requests: number } }).__midiMock.requests,
    ),
  ).toBe(0);
  await midi.getByRole("button", { name: "Connect MIDI", exact: true }).click();
  await expect(midi).toHaveAttribute("data-midi-status", "no-device");
  await page.evaluate(() =>
    (window as unknown as { __midiMock: { hotplug(): void } }).__midiMock.hotplug(),
  );
  await expect(midi).toHaveAttribute("data-midi-armed", "true");
  await midi.getByRole("button", { name: "Disarm", exact: true }).click();
  await page.evaluate(() =>
    (window as unknown as { __midiMock: { hotplug(id: string): void } }).__midiMock.hotplug(
      "mock-midi-2",
    ),
  );
  await expect(midi).toHaveAttribute("data-midi-armed", "false");
  await midi.getByLabel("MIDI input device").selectOption("mock-midi-2");
  const counts = await page.evaluate(() => {
    const mock = (window as unknown as { __midiMock: { listenerCount(id: string): number } })
      .__midiMock;
    return [mock.listenerCount("mock-midi-1"), mock.listenerCount("mock-midi-2")];
  });
  expect(counts).toEqual([0, 1]);
});

test("MIDI-authored Rest continuation retains owner and exact phrase across existing views and themes", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openStudio(page, createPianoRollSystemChordFixture("t210-rest-views"));
  const midi = page.getByTestId("piano-roll-midi-step-input");
  await midi.getByRole("checkbox", { name: "Sound on input" }).uncheck();
  await midi.getByLabel("MIDI step duration").selectOption("whole-dotted");
  await midi.getByLabel("MIDI insertion cursor beat as a fraction").fill("49/4");
  await midi.getByRole("button", { name: "Set", exact: true }).click();
  await midi.getByLabel("Manual MIDI pitch").fill("68");
  await midi.getByRole("button", { name: "Insert MIDI pitch 68" }).click();
  const inserted = decodePortableProject(await exportProjectText(page));
  const rest = inserted.progression.steps.find((step) => step.id === "rest-d");
  if (rest?.kind !== "rest" || !rest.authoredMelody) throw new Error("Missing authored Rest");
  const note = rest.authoredMelody.notes.find((note) => note.pitch.midiNumber === 68)!;
  expect(note).toMatchObject({
    onset: { numerator: 1, denominator: 4 },
    duration: { numerator: 6, denominator: 1 },
  });
  await page.getByRole("button", { name: "Close Midi Settings" }).click();
  for (const theme of ["Dark theme", "Light theme"]) {
    await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: theme }).click();
    for (const view of ["piano-roll", "staff", "tablature"]) {
      await page.getByTestId(`progression-view-btn-${view}`).click();
      const attribute =
        view === "piano-roll" ? "data-piano-roll-event-key" : "data-melody-event-key";
      const ownerAttribute =
        view === "staff" || view === "tablature" ? "data-step-id" : "data-source-step-id";
      const rendered = page.locator(
        `[${attribute}="${note.id}"][${ownerAttribute}="rest-d"]:visible`,
      );
      await expect(rendered.first()).toBeVisible();
      expect(await rendered.count()).toBeGreaterThan(1);
      const roundTrip = decodePortableProject(await exportProjectText(page));
      const owner = roundTrip.progression.steps.find((step) => step.id === "rest-d");
      if (owner?.kind !== "rest") throw new Error("Rest ownership changed across views");
      expect(owner.authoredMelody).toEqual(rest.authoredMelody);
    }
  }
  await page.getByTestId("progression-view-btn-piano-roll").click();
  await page.getByRole("button", { name: "Midi Settings", exact: true }).click();
  await expect(midi).toHaveAttribute("data-cursor", "73/4");
});

test("MIDI altered pitch preserves exact full-height Degrees notes and chord guides at every viewport", async ({
  page,
}) => {
  await openStudio(page, createPianoRollSystemChordFixture("t210-guides"));
  const midi = page.getByTestId("piano-roll-midi-step-input");
  await midi.getByRole("checkbox", { name: "Sound on input" }).uncheck();
  await midi.getByLabel("MIDI insertion cursor beat as a fraction").fill("2");
  await midi.getByRole("button", { name: "Set", exact: true }).click();
  await midi.getByLabel("Manual MIDI pitch").fill("61");
  await midi.getByRole("button", { name: "Insert MIDI pitch 61" }).click();
  await page.getByRole("button", { name: "Close Midi Settings" }).click();
  const toolbar = page.getByTestId("piano-roll-toolbar");
  await toolbar.getByRole("button", { name: "Degrees", exact: true }).click();
  const grid = page.getByRole("group", { name: "Melody grid, measure 1" });
  const note = grid.locator('button.piano-roll-note[data-pitch-midi="61"][data-generated="false"]');
  const guides = toolbar.getByRole("button", { name: "Guides", exact: true });
  for (const [width, height] of [
    [640, 360],
    [1280, 720],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width: requireValue(width), height: requireValue(height) });
    for (const theme of ["Dark theme", "Light theme"]) {
      await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: theme }).click();
      if ((await guides.getAttribute("aria-pressed")) !== "true") await guides.click();
      for (const pitch of [60, 64, 67]) {
        const guide = grid.locator(
          `.piano-roll-row[data-pitch-midi="${pitch}"] [data-testid="piano-roll-guide-tone"][data-source-step-id="chord-a"]`,
        );
        await expect(guide).toHaveCount(1);
        await expect(guide).toHaveAttribute("data-pitch-class", String(pitch % 12));
        await expect(guide).toHaveAttribute("data-guide-half", "full");
      }
      await expect(
        grid.locator(
          '.piano-roll-row[data-pitch-midi="62"] [data-testid="piano-roll-guide-tone"][data-source-step-id="chord-a"]',
        ),
      ).toHaveCount(0);
      await note.scrollIntoViewIfNeeded();
      await expect(note).toBeInViewport();
      const before = await note.boundingBox();
      if (!before) throw new Error("Altered MIDI note disappeared");
      const row = await grid.locator('.piano-roll-row[data-pitch-midi="60"]').boundingBox();
      if (!row) throw new Error("Degrees row disappeared");
      expect(Math.abs(before.height - row.height)).toBeLessThanOrEqual(1);
      await guides.click();
      await expect(grid.locator('[data-testid="piano-roll-guide-tone"]')).toHaveCount(0);
      const after = await note.boundingBox();
      if (!after) throw new Error("Altered MIDI note disappeared with Guides OFF");
      expect(Math.abs(before.height - after.height)).toBeLessThanOrEqual(1);
      await expect(note).toHaveAttribute("data-start-beats", "2/1");
      await expect(note).toHaveAttribute("data-duration-beats", "1/1");
    }
  }
});

test("MIDI step controls and cursor render at normal scale in both themes and pitch grids", async ({
  page,
}) => {
  await installMidiMock(page, { inputCount: 1 });
  await openStudio(page, createPianoRollSystemChordFixture("t210-midi-captures"));
  const midi = page.getByTestId("piano-roll-midi-step-input");
  await midi.getByRole("button", { name: "Connect MIDI", exact: true }).click();
  await armMidi(page);
  await midi.getByLabel("MIDI insertion cursor beat as a fraction").fill("1/3");
  await midi.getByRole("button", { name: "Set", exact: true }).click();
  await mkdir("artifacts/validation/t210-midi", { recursive: true });
  const toolbar = page.getByTestId("piano-roll-toolbar");
  const theme = page.getByRole("group", { name: "Theme" });
  const pitchGrid = page.getByRole("group", { name: "Pitch grid" });
  for (const themeName of ["Dark theme", "Light theme"] as const) {
    await theme.getByRole("button", { name: themeName }).click();
    for (const gridName of ["Degrees", "Chromatic"] as const) {
      await pitchGrid.getByRole("button", { name: gridName, exact: true }).click();
      for (const [width, height, size] of [
        [640, 360, "640x360"],
        [1280, 720, "1280x720"],
        [1920, 1080, "1920x1080"],
      ] as const) {
        await page.setViewportSize({ width, height });
        const entry = page.getByRole("button", { name: "Midi Settings", exact: true });
        if ((await entry.getAttribute("aria-expanded")) === "true")
          await page.getByRole("button", { name: "Close Midi Settings" }).click();
        await toolbar.scrollIntoViewIfNeeded();
        await page.evaluate(() => {
          const toolbar = document.querySelector('[data-testid="piano-roll-toolbar"]')!;
          const header = document.querySelector(".app-header")!;
          window.scrollBy(
            0,
            toolbar.getBoundingClientRect().top - header.getBoundingClientRect().height - 12,
          );
        });
        await expect(midi).toBeHidden();
        const stem = `${requireValue(themeName.split(" ")[0]).toLowerCase()}-${gridName.toLowerCase()}-${size}`;
        await page.screenshot({
          path: `artifacts/validation/t210-midi/${stem}-closed.png`,
          animations: "disabled",
        });
        await entry.click();
        await expect(midi).toBeVisible();
        const geometry = await page.locator("#midi-settings-panel").evaluate((element) => {
          const panel = element.getBoundingClientRect();
          const header = document.querySelector(".app-header")!.getBoundingClientRect();
          return {
            left: panel.left,
            right: panel.right,
            top: panel.top,
            headerBottom: header.bottom,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          };
        });
        expect(geometry.left).toBeGreaterThanOrEqual(0);
        expect(geometry.right).toBeLessThanOrEqual(width);
        expect(geometry.top).toBeGreaterThanOrEqual(geometry.headerBottom);
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
        await page.screenshot({
          path: `artifacts/validation/t210-midi/${stem}-open.png`,
          animations: "disabled",
        });
        if (width === 640) {
          await page.locator("#midi-settings-panel").evaluate((element) => {
            element.scrollTop = element.scrollHeight;
          });
          await midi.getByLabel("Manual MIDI pitch").focus();
          await expect(midi.getByRole("checkbox", { name: "Sound on input" })).toBeInViewport();
          await page.screenshot({
            path: `artifacts/validation/t210-midi/${stem}-open-bottom.png`,
            animations: "disabled",
          });
          await page.locator("#midi-settings-panel").evaluate((element) => {
            element.scrollTop = 0;
          });
        }
        await page
          .locator(".app-status-bar")
          .screenshot({ path: `artifacts/validation/t210-midi/${stem}-status.png` });
      }
    }
  }
});
