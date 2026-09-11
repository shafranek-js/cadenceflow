import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { expect, test, type Page } from "@playwright/test";
import { ensureHistoryControlsVisible } from "./test-helpers/global-settings";

const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
] as const;

async function openStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
}

async function addChord(page: Page, functionId: string): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
}

async function assertNoHorizontalScroll(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
}

async function createMelody(
  page: Page,
  options: { readonly preview: boolean; readonly instrument?: string } = { preview: true },
): Promise<void> {
  await page.getByLabel("Progression Card View").selectOption("staff");
  const invoker = page.locator(".measure-staff-event .measure-staff-event-select").last();
  await invoker.focus();
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: /Melody actions/ });
  await expect(menu.getByRole("menuitem", { name: "Create Melody…" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Create Melody…" }).click();

  const dialog = page.getByRole("dialog", { name: "Create Melody" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Melody Pattern").selectOption("outside-in");
  await dialog.getByLabel("Melody Grid").selectOption("sixteenth-triplet");
  if (options.instrument && !options.preview) {
    await dialog.getByLabel("Melody Instrument").selectOption(options.instrument);
  }

  if (options.preview) {
    const playPreview = dialog.getByRole("button", { name: "Play melody preview" });
    await expect(playPreview).toBeEnabled();
    await playPreview.click();
    await expect(dialog.getByRole("button", { name: "Stop melody preview" })).toBeVisible({
      timeout: 60_000,
    });
    await dialog.getByRole("button", { name: "Stop melody preview" }).click();
    await expect(playPreview).toBeVisible();
    // Recipe edits are observable controls: the preview is stopped before the draft changes.
    await dialog.getByLabel("Melody Pattern").selectOption("inside-out");
    await expect(dialog.getByRole("button", { name: "Play melody preview" })).toBeVisible();
    await dialog.getByLabel("Melody Grid").selectOption("eighth");
    if (options.instrument) {
      await dialog.getByLabel("Melody Instrument").selectOption(options.instrument);
    }
  }

  await dialog.getByRole("button", { name: "Apply Melody" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(invoker).toBeFocused();
}

async function waitForAutosaveWithMelody(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const state = (
            window as unknown as {
              __cadenceflow_persistence__?: { lastCompletedProjectSnapshot?: string };
            }
          ).__cadenceflow_persistence__;
          return (
            state?.lastCompletedProjectSnapshot?.includes('"instrument":"cello"') === true &&
            state.lastCompletedProjectSnapshot.includes('"volume":73')
          );
        }),
      { timeout: 30_000, intervals: [50, 100, 250, 500, 1000] },
    )
    .toBe(true);
}

async function assertFreshHistory(page: Page): Promise<void> {
  await ensureHistoryControlsVisible(page);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Redo", exact: true })).toBeDisabled();
}

interface PlaybackObservation {
  readonly pianoSchedules: string[][];
  oscillatorCount: number;
}

interface PlaybackObservationWindow {
  __cadenceflow_playback_observability__?: PlaybackObservation;
}

/** Uses the existing DEV/test audio hook and real user transport to observe channel isolation. */
async function installPlaybackObservability(page: Page): Promise<void> {
  await page.evaluate(() => {
    type ScheduleEvent = { readonly channelRole?: string };
    type ProviderPrototype = {
      schedule: (events: readonly ScheduleEvent[], clock: unknown) => unknown;
      __cadenceflowAcceptanceWrapped__?: boolean;
    };
    type AudioHookWindow = PlaybackObservationWindow & {
      __cadenceflow_audio__?: {
        HqSamplePianoProvider?: { prototype: ProviderPrototype };
      };
    };
    const testWindow = window as unknown as AudioHookWindow;
    const observation =
      testWindow.__cadenceflow_playback_observability__ ??
      ({ pianoSchedules: [], oscillatorCount: 0 } satisfies PlaybackObservation);
    testWindow.__cadenceflow_playback_observability__ = observation;
    const pianoPrototype = testWindow.__cadenceflow_audio__?.HqSamplePianoProvider?.prototype;
    if (pianoPrototype && !pianoPrototype.__cadenceflowAcceptanceWrapped__) {
      const originalSchedule = pianoPrototype.schedule;
      pianoPrototype.schedule = function (this: unknown, events, clock) {
        observation.pianoSchedules.push(events.map((event) => event.channelRole ?? "unknown"));
        return originalSchedule.call(this, events, clock);
      };
      pianoPrototype.__cadenceflowAcceptanceWrapped__ = true;
    }

    type AudioContextPrototype = {
      createOscillator: (this: AudioContext) => OscillatorNode;
      __cadenceflowAcceptanceWrapped__?: boolean;
    };
    const audioContextPrototype = AudioContext.prototype as unknown as AudioContextPrototype;
    if (!audioContextPrototype.__cadenceflowAcceptanceWrapped__) {
      const originalCreateOscillator = audioContextPrototype.createOscillator;
      audioContextPrototype.createOscillator = function (this: AudioContext) {
        observation.oscillatorCount += 1;
        return originalCreateOscillator.call(this);
      };
      audioContextPrototype.__cadenceflowAcceptanceWrapped__ = true;
    }
  });
}

async function resetPlaybackObservability(page: Page): Promise<void> {
  await page.evaluate(() => {
    const observation = (window as unknown as PlaybackObservationWindow)
      .__cadenceflow_playback_observability__;
    if (!observation) throw new Error("playback observability was not installed");
    observation.pianoSchedules.length = 0;
    observation.oscillatorCount = 0;
  });
}

async function readPlaybackObservability(page: Page): Promise<PlaybackObservation> {
  return page.evaluate(() => {
    const observation = (window as unknown as PlaybackObservationWindow)
      .__cadenceflow_playback_observability__;
    if (!observation) throw new Error("playback observability was not installed");
    return {
      pianoSchedules: observation.pianoSchedules.map((roles) => [...roles]),
      oscillatorCount: observation.oscillatorCount,
    };
  });
}

function readU16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function vlq(bytes: Uint8Array, cursor: { value: number }): number {
  let value = 0;
  for (;;) {
    const byte = bytes[cursor.value++];
    if (byte === undefined) throw new Error("truncated MIDI VLQ");
    value = (value << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) return value;
  }
}

function parseMelodyMidi(bytes: Uint8Array): {
  readonly format: number;
  readonly tracks: number;
  readonly ppq: number;
  readonly name: string;
  readonly instrument: string;
  readonly channel: number;
  readonly program: number;
  readonly notes: number;
} {
  if (ascii(bytes, 0, 4) !== "MThd" || readU32(bytes, 4) !== 6) {
    throw new Error("download is not an SMF");
  }
  const result = {
    format: readU16(bytes, 8),
    tracks: readU16(bytes, 10),
    ppq: readU16(bytes, 12),
  };
  let offset = 14;
  for (let trackIndex = 0; trackIndex < result.tracks; trackIndex += 1) {
    if (ascii(bytes, offset, 4) !== "MTrk") throw new Error("missing MIDI track");
    const length = readU32(bytes, offset + 4);
    const start = offset + 8;
    const end = start + length;
    const cursor = { value: start };
    let status: number | undefined;
    let name = "";
    let instrument = "";
    let channel = -1;
    let program = -1;
    let notes = 0;
    const active = new Set<string>();
    while (cursor.value < end) {
      vlq(bytes, cursor);
      let next = bytes[cursor.value++];
      if (next === undefined) throw new Error("truncated MIDI event");
      if (next < 0x80) {
        cursor.value -= 1;
        next = status;
        if (next === undefined) throw new Error("invalid MIDI running status");
      } else if (next < 0xf0) {
        status = next;
      }
      if (next === 0xff) {
        const meta = bytes[cursor.value++];
        if (meta === undefined) throw new Error("truncated MIDI meta event");
        const size = vlq(bytes, cursor);
        const data = bytes.slice(cursor.value, cursor.value + size);
        cursor.value += size;
        if (meta === 0x03) name = new TextDecoder().decode(data);
        if (meta === 0x04) instrument = new TextDecoder().decode(data);
        continue;
      }
      if (next === 0xf0 || next === 0xf7) {
        cursor.value += vlq(bytes, cursor);
        continue;
      }
      const command = next & 0xf0;
      const eventChannel = next & 0x0f;
      channel = channel === -1 ? eventChannel : channel;
      const pitchOrController = bytes[cursor.value++];
      if (pitchOrController === undefined) throw new Error("truncated MIDI channel data");
      const value = command === 0xc0 || command === 0xd0 ? undefined : bytes[cursor.value++];
      if (command === 0xc0) program = pitchOrController;
      if (command === 0x90 && value !== 0) {
        notes += 1;
        active.add(`${eventChannel}:${pitchOrController}`);
      }
      if (command === 0x80 || (command === 0x90 && value === 0)) {
        active.delete(`${eventChannel}:${pitchOrController}`);
      }
    }
    if (active.size > 0) throw new Error("MIDI Melody track has hanging notes");
    if (name === "CadenceFlow Melody") {
      return Object.freeze({ ...result, name, instrument, channel, program, notes });
    }
    offset = end;
  }
  throw new Error("download has no Melody track");
}

function parseMelodyMusicXml(xml: string): {
  readonly instrument: string;
  readonly channel: number;
  readonly program: number;
  readonly clef: string;
  readonly notes: number;
} {
  const document = new JSDOM(xml, { contentType: "text/xml" }).window.document;
  const scorePart = document.querySelector('score-part[id="P2"]');
  const part = document.querySelector('part[id="P2"]');
  if (!scorePart || !part) throw new Error("MusicXML Melody P2 part is missing");
  const notes = [...part.querySelectorAll(":scope > measure > note")].filter(
    (note) => !note.querySelector(":scope > rest"),
  );
  return Object.freeze({
    instrument: scorePart.querySelector(":scope > score-instrument > instrument-name")!
      .textContent!,
    channel: Number(
      scorePart.querySelector(":scope > midi-instrument > midi-channel")!.textContent,
    ),
    program: Number(
      scorePart.querySelector(":scope > midi-instrument > midi-program")!.textContent,
    ),
    clef: part.querySelector(":scope > measure > attributes > clef > sign")!.textContent!,
    notes: notes.length,
  });
}

async function exportFiles(page: Page): Promise<{
  readonly midi: ReturnType<typeof parseMelodyMidi>;
  readonly musicXml: ReturnType<typeof parseMelodyMusicXml>;
}> {
  await page.getByTestId("export-menu-toggle").click();
  await expect(page.getByRole("menu", { name: "Export menu" })).toBeVisible();
  const midiDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-midi-btn").click();
  const midiDownload = await midiDownloadPromise;
  const midiPath = await midiDownload.path();
  expect(midiPath).not.toBeNull();
  const midi = parseMelodyMidi(new Uint8Array(await readFile(midiPath!)));

  const exportMenu = page.getByRole("menu", { name: "Export menu" });
  if (!(await exportMenu.isVisible())) await page.getByTestId("export-menu-toggle").click();
  await expect(exportMenu).toBeVisible();
  const xmlDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-musicxml-btn").click();
  const xmlDownload = await xmlDownloadPromise;
  const xmlPath = await xmlDownload.path();
  expect(xmlPath).not.toBeNull();
  const musicXml = parseMelodyMusicXml(await readFile(xmlPath!, "utf8"));
  return { midi, musicXml };
}

async function assertThemesAndLayout(page: Page): Promise<void> {
  const progression = page.getByRole("region", { name: "My Progression" });
  const themes = page.getByRole("group", { name: "Theme" });
  for (const theme of ["light", "dark"] as const) {
    const button = themes.getByRole("button", {
      name: `${theme[0]!.toUpperCase()}${theme.slice(1)} theme`,
    });
    if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(progression.getByRole("region", { name: "Melody Track controls" })).toBeVisible();
    await expect(page.getByTestId("progression-measure-score").first()).toBeVisible();
    await expect(page.getByTestId("melody-staff-measure").first()).toBeVisible();
    await expect(page.locator(".melody-staff-note.is-selected").first()).toBeVisible();
    await assertNoHorizontalScroll(page);
  }
}

for (const viewport of VIEWPORTS) {
  test.describe(`US12 final acceptance at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("persists Melody, previews the draft, highlights playback, and exports both files", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await page.addInitScript(() => {
        (
          window as unknown as {
            __CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__?: boolean;
            __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean;
          }
        ).__CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__ = true;
        (
          window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
        ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
      });
      await openStudio(page);
      await ensureHistoryControlsVisible(page);
      await addChord(page, "I");
      await createMelody(page, { preview: true, instrument: "cello" });
      await addChord(page, "V");
      await addChord(page, "vi");
      await page.getByLabel("Progression Card View").selectOption("staff");

      const progression = page.getByRole("region", { name: "My Progression" });
      const controls = progression.getByRole("region", { name: "Melody Track controls" });
      await expect(controls).toBeVisible();
      await expect(controls.getByLabel("Melody Track Instrument")).toHaveValue("cello");
      await expect(controls).toContainText("Melody audio ready", { timeout: 60_000 });
      await expect(page.getByTestId("melody-staff-measure")).not.toHaveCount(0);

      const undo = page.getByRole("button", { name: "Undo", exact: true });
      const redo = page.getByRole("button", { name: "Redo", exact: true });
      await expect(undo).toBeEnabled();
      await undo.click();
      await expect(progression.getByRole("region", { name: "Melody Track controls" })).toHaveCount(
        0,
      );
      await redo.click();
      await expect(controls).toBeVisible();

      await controls.getByRole("button", { name: "Mute Melody Track" }).click();
      await expect(controls.getByRole("button", { name: "Mute Melody Track" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await controls.getByRole("button", { name: "Solo Melody Track" }).click();
      await expect(controls.getByRole("button", { name: "Solo Melody Track" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(controls.getByRole("button", { name: "Mute Melody Track" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await controls.getByRole("button", { name: "Solo Melody Track" }).click();
      const volume = controls.getByLabel("Melody Track Volume");
      await volume.focus();
      for (let index = 0; index < 27; index += 1) await volume.press("ArrowLeft");
      await expect(volume).toHaveValue("73");
      await page.locator("[data-melody-event-key]").first().click();
      await expect(page.locator("[data-melody-event-key]").first()).toHaveAttribute(
        "aria-label",
        /source chord/,
      );

      await waitForAutosaveWithMelody(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("project-menu-toggle")).toBeVisible();
      await expect(
        progression.getByRole("region", { name: "Melody Track controls" }),
      ).toBeVisible();
      await expect(progression.getByLabel("Melody Track Instrument")).toHaveValue("cello");
      await expect(progression.getByLabel("Melody Track Volume")).toHaveValue("73");
      await expect(page.getByTestId("transport-status")).toContainText("Stopped");
      await expect(
        page.locator('[data-testid="progression-step"][data-playing="true"]'),
      ).toHaveCount(0);
      await assertFreshHistory(page);
      await expect(
        progression.getByRole("region", { name: "Melody Track controls" }),
      ).toContainText("Melody audio ready", { timeout: 60_000 });

      const persistedMelodyNote = page.locator("[data-melody-event-key]").first();
      await expect(persistedMelodyNote).toBeVisible();
      await persistedMelodyNote.click();
      const persistedInvoker = page.locator(
        '.measure-staff-event .measure-staff-event-select[aria-pressed="true"]',
      );
      await expect(persistedInvoker).toHaveCount(1);
      await persistedInvoker.focus();
      await page.keyboard.press("Shift+F10");
      const persistedMenu = page.getByRole("menu", { name: /Melody actions/ });
      await persistedMenu.getByRole("menuitem", { name: "Edit Melody…" }).click();
      const editDialog = page.getByRole("dialog", { name: "Edit Melody" });
      await expect(editDialog.getByLabel("Melody Pattern")).toHaveValue("inside-out");
      await expect(editDialog.getByLabel("Melody Grid")).toHaveValue("eighth");
      await expect(editDialog.getByLabel("Melody Instrument")).toHaveValue("cello");
      await editDialog.getByRole("button", { name: "Cancel" }).click();
      await expect(persistedInvoker).toBeFocused();

      const melodyInstrument = progression.getByLabel("Melody Track Instrument");
      const melodySvg = page.getByTestId("melody-staff-measure").first().locator("svg");
      const pianoSvg = page
        .getByTestId("measure-staff-view")
        .first()
        .locator(".measure-staff > svg");
      const pianoClefBefore = await pianoSvg.getAttribute("data-staff-clef");
      const pianoPresentationBefore = await page
        .getByTestId("measure-staff-view")
        .first()
        .locator(".measure-staff-event-select")
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));
      await melodyInstrument.selectOption("flute");
      await expect(melodySvg).toHaveAttribute("data-staff-clef", "treble");
      await expect(pianoSvg).toHaveAttribute("data-staff-clef", pianoClefBefore!);
      await expect
        .poll(() =>
          page
            .getByTestId("measure-staff-view")
            .first()
            .locator(".measure-staff-event-select")
            .evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label"))),
        )
        .toEqual(pianoPresentationBefore);
      await melodyInstrument.selectOption("cello");
      await expect(melodySvg).toHaveAttribute("data-staff-clef", "bass");
      await expect(controls).toContainText("Melody audio ready", { timeout: 60_000 });

      const play = progression.getByRole("button", { name: "Play", exact: true });
      const pause = progression.getByRole("button", { name: "Pause", exact: true });
      const resume = progression.getByRole("button", { name: "Resume", exact: true });
      const stop = progression.getByRole("button", { name: "Stop", exact: true });

      await installPlaybackObservability(page);
      await resetPlaybackObservability(page);
      const mute = controls.getByRole("button", { name: "Mute Melody Track" });
      const solo = controls.getByRole("button", { name: "Solo Melody Track" });
      await mute.click();
      await expect(mute).toHaveAttribute("aria-pressed", "true");
      await play.click();
      await expect
        .poll(
          () =>
            readPlaybackObservability(page).then(
              (observation) => observation.pianoSchedules.length,
            ),
          {
            timeout: 10_000,
            intervals: [20, 40, 80, 120],
          },
        )
        .toBeGreaterThan(0);
      await expect(page.locator(".melody-staff-note.is-active")).toHaveCount(0);
      if (await stop.isEnabled()) await stop.click();
      await expect(page.getByTestId("transport-status")).toContainText("Stopped");
      await mute.click();
      await expect(mute).toHaveAttribute("aria-pressed", "false");

      await resetPlaybackObservability(page);
      await solo.click();
      await expect(solo).toHaveAttribute("aria-pressed", "true");
      const metronome = page.getByRole("button", { name: "Toggle Metronome" });
      if ((await metronome.getAttribute("aria-pressed")) !== "true") await metronome.click();
      await play.click();
      await expect(page.getByTestId("transport-status")).toContainText("Playing");
      await expect
        .poll(
          () =>
            readPlaybackObservability(page).then(
              (observation) => observation.pianoSchedules.length,
            ),
          {
            timeout: 10_000,
            intervals: [20, 40, 80, 120],
          },
        )
        .toBe(0);
      await expect
        .poll(
          () => readPlaybackObservability(page).then((observation) => observation.oscillatorCount),
          {
            timeout: 10_000,
            intervals: [20, 40, 80, 120],
          },
        )
        .toBeGreaterThan(0);
      expect((await readPlaybackObservability(page)).pianoSchedules).toHaveLength(0);
      await expect
        .poll(() => page.locator(".melody-staff-note.is-active").count(), {
          timeout: 15_000,
          intervals: [40, 80, 120, 250, 500],
        })
        .toBeGreaterThan(0);
      await pause.click();
      await expect(page.getByTestId("transport-status")).toContainText("Paused");
      await resume.click();
      await expect(page.getByTestId("transport-status")).toContainText("Playing");
      if (await stop.isEnabled()) await stop.click();
      await expect(page.getByTestId("transport-status")).toContainText("Stopped");
      await expect(page.locator(".melody-staff-note.is-active")).toHaveCount(0);
      await solo.click();
      await expect(solo).toHaveAttribute("aria-pressed", "false");
      if ((await metronome.getAttribute("aria-pressed")) === "true") await metronome.click();

      const exported = await exportFiles(page);
      expect(exported.midi).toMatchObject({
        format: 1,
        tracks: 4,
        ppq: 120,
        name: "CadenceFlow Melody",
        instrument: "Cello",
        channel: 2,
        program: 42,
      });
      expect(exported.midi.notes).toBeGreaterThan(0);
      expect(exported.musicXml).toMatchObject({
        instrument: "Cello",
        channel: 3,
        program: 43,
        clef: "F",
      });
      expect(exported.musicXml.notes).toBeGreaterThan(0);

      await assertThemesAndLayout(page);
    });
  });
}

test.describe("US12 Melody provider isolation", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("keeps Piano, metronome, and exports usable when local Melody samples fail", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      (
        window as unknown as {
          __CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__?: boolean;
          __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean;
        }
      ).__CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__ = true;
      (
        window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
      ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
    });
    await page.route("**/audio/melody/FluidR3_GM/**", (route) => route.abort());
    await openStudio(page);
    await addChord(page, "I");
    await createMelody(page, { preview: false });
    const progression = page.getByRole("region", { name: "My Progression" });
    const controls = progression.getByRole("region", { name: "Melody Track controls" });
    await expect(controls).toContainText("Melody audio error", { timeout: 30_000 });
    await expect(controls.getByRole("button", { name: "Retry" })).toBeVisible();
    const pianoStatus = page.getByTestId("piano-audio-status");
    await expect(pianoStatus).toHaveAttribute("data-status", /^(ready|fallback)$/);
    await expect(pianoStatus).not.toHaveAttribute("data-status", "error");

    const chordInvoker = page.locator(".measure-staff-event .measure-staff-event-select").first();
    await chordInvoker.click();
    await expect(page.locator(".measure-staff-event.is-playing").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByTestId("export-menu-toggle").click();
    await expect(page.getByRole("menu", { name: "Export menu" })).toBeVisible();
    await expect(page.getByTestId("export-midi-btn")).toBeEnabled();
    await expect(page.getByTestId("export-musicxml-btn")).toBeEnabled();
    await page.keyboard.press("Escape");

    await installPlaybackObservability(page);
    await resetPlaybackObservability(page);
    const metronome = page.getByRole("button", { name: "Toggle Metronome" });
    if ((await metronome.getAttribute("aria-pressed")) !== "true") await metronome.click();
    const play = progression.getByRole("button", { name: "Play", exact: true });
    const stop = progression.getByRole("button", { name: "Stop", exact: true });
    await play.click();
    await expect
      .poll(
        () => readPlaybackObservability(page).then((observation) => observation.oscillatorCount),
        {
          timeout: 10_000,
          intervals: [20, 40, 80, 120],
        },
      )
      .toBeGreaterThan(0);
    if (await stop.isEnabled()) await stop.click();
    await expect(page.getByTestId("transport-status")).toContainText("Stopped");
  });
});
