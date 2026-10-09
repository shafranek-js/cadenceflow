import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Project } from "../../src/domain/project/project";
import {
  decodePortableProject,
  encodePortableProject,
} from "../../src/persistence/portableProject";
import { compositionKeyboardRange } from "../../src/ui/piano/playbackKeyboardModel";
import { exactPitch } from "../../src/domain/harmony/pitch";
import { createPianoRollSystemChordFixture } from "../fixtures/piano-roll-system-chord.fixture";

async function setup(
  page: Page,
  fixture = createPianoRollSystemChordFixture("playback-keyboard-fixture"),
) {
  await page.addInitScript(() => {
    (
      window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: "keyboard.cadenceflow",
    mimeType: "application/json",
    buffer: Buffer.from(encodePortableProject(fixture)),
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Show keyboard", exact: true }).first(),
  ).toBeVisible();
  return fixture;
}
async function portable(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByTestId("export-menu-toggle").click();
  await page.getByTestId("project-export-btn").click();
  const path = await (await pending).path();
  return readFile(path!, "utf8");
}
test("keyboard is global, persistent, accessible and leaves Project and scrolling unchanged", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (
      window as Window & { __CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__ = true;
  });
  await setup(page);
  const buttons = page.getByRole("button", { name: "Show keyboard", exact: true });
  await expect(page.getByRole("region", { name: "Playback piano keyboard" })).toHaveCount(0);
  const before = await portable(page);
  await buttons.first().scrollIntoViewIfNeeded();
  const readScroll = () =>
    page.locator(".studio-grid").evaluate((el) => {
      const button = [...el.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.trim() === "Show keyboard",
      );
      return {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        buttonTop: button?.getBoundingClientRect().top ?? null,
      };
    });
  const beforeScroll = await readScroll();
  await buttons.first().click();
  for (const button of await buttons.all())
    await expect(button).toHaveAttribute("aria-pressed", "true");
  const afterScroll = await readScroll();
  expect(afterScroll.scrollTop, JSON.stringify({ beforeScroll, afterScroll })).toBe(
    beforeScroll.scrollTop,
  );
  await page.getByLabel("Keyboard range").selectOption("88");
  await expect(page.locator(".playback-key")).toHaveCount(88);
  await page.getByLabel("Keyboard notes").selectOption("melody");
  const focused = page.locator('.playback-key[tabindex="0"]');
  await focused.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('.playback-key[tabindex="0"]')).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await portable(page)).toBe(before);
  await page.getByTestId("progression-view-btn-staff").click();
  await expect(page.locator(".playback-keyboard")).toHaveCount(0);
  await page.getByTestId("progression-view-btn-piano-roll").click();
  await expect(page.getByLabel("Keyboard range")).toHaveValue("88");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const hooks = (
          window as Window & {
            __cadenceflow_persistence__?: {
              readonly lastScheduledProjectSnapshot: string;
              readonly lastCompletedProjectSnapshot: string;
            };
          }
        ).__cadenceflow_persistence__;
        if (!hooks?.lastScheduledProjectSnapshot || !hooks.lastCompletedProjectSnapshot)
          return false;
        const scheduled = JSON.parse(hooks.lastScheduledProjectSnapshot) as Project;
        const completed = JSON.parse(hooks.lastCompletedProjectSnapshot) as Project;
        return (
          hooks.lastScheduledProjectSnapshot === hooks.lastCompletedProjectSnapshot &&
          scheduled.presentation.progressionView === "piano-roll" &&
          completed.presentation.progressionView === "piano-roll"
        );
      }),
    )
    .toBe(true);
  await page.reload();
  await expect(page.getByLabel("Keyboard notes")).toHaveValue("melody");
  await expect(page.getByLabel("Keyboard range")).toHaveValue("88");
  await page.getByRole("button", { name: "Close keyboard" }).click();
  await expect(page.locator(".playback-keyboard")).toHaveCount(0);
  await expect(buttons.first()).toHaveAttribute("aria-pressed", "false");
});
test("keyboard follows transport notes, filters melody, clears pause/stop and previews without recording", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Show keyboard", exact: true }).first().click();
  await page.evaluate(() => {
    const target = window as unknown as {
      __keyboardPreviews: unknown[];
      __cadenceflow_audio__: {
        PreviewAuditionController: { prototype: { audition: (events: unknown[]) => null } };
      };
    };
    target.__keyboardPreviews = [];
    target.__cadenceflow_audio__.PreviewAuditionController.prototype.audition = (events) => {
      target.__keyboardPreviews.push(events);
      return null;
    };
  });
  await page.getByRole("button", { name: "Piano key C4", exact: true }).click({ force: true });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __keyboardPreviews: unknown[] }).__keyboardPreviews.length,
      ),
    )
    .toBe(1);
  const event = await page.evaluate(
    () =>
      (window as unknown as { __keyboardPreviews: { pitch: number; durationSeconds: number }[][] })
        .__keyboardPreviews[0]![0],
  );
  expect(event).toMatchObject({ pitch: 60, durationSeconds: 0.25 });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() => page.locator('.playback-key[data-active="true"]').count())
    .toBeGreaterThan(1);
  await page.getByRole("button", { name: "Piano key C4", exact: true }).click({ force: true });
  expect(
    await page.evaluate(
      () => (window as unknown as { __keyboardPreviews: unknown[] }).__keyboardPreviews.length,
    ),
  ).toBe(1);
  await page.getByLabel("Keyboard notes").selectOption("melody");
  await expect
    .poll(() => page.locator('.playback-key[data-active="true"]').count())
    .toBeLessThanOrEqual(2);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator('.playback-key[data-active="true"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect
    .poll(() => page.locator('.playback-key[data-active="true"]').count())
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.locator('.playback-key[data-active="true"]')).toHaveCount(0);
});

test("keyboard follows the scheduled chord, Melody note, Measure and System preview sessions", async ({
  page,
}, testInfo) => {
  await setup(page);
  await page.getByRole("button", { name: "Show keyboard", exact: true }).first().click();
  await page.evaluate(() => {
    type AudioEvent = {
      readonly pitch: number;
      readonly startSeconds: number;
      readonly durationSeconds: number;
      readonly channelRole: string;
    };
    type Clock = { now(): number };
    type PlaybackRecord = {
      readonly provider: string;
      readonly events: readonly AudioEvent[];
      readonly scheduledAt: number;
      cancelled: boolean;
    };
    type ProviderPrototype = {
      state?: string;
      prepare?: () => Promise<void>;
      prepareForInstruments?: (instruments: readonly string[]) => Promise<{
        readonly ready: readonly string[];
        readonly unavailable: readonly string[];
        readonly failed: readonly string[];
      }>;
      schedule?: (events: readonly AudioEvent[], clock: Clock) => unknown;
      schedulePreview?: (events: readonly AudioEvent[], clock: Clock) => unknown;
      setPreviewSettings?: () => void;
    };
    type AudioHooks = {
      HqSamplePianoProvider?: { prototype: ProviderPrototype };
      MelodySoundFontProvider?: { prototype: ProviderPrototype };
    };
    type TestWindow = Window & {
      __cadenceflow_audio__?: AudioHooks;
      __keyboardAudioTime?: number;
      __keyboardScheduled?: PlaybackRecord[];
    };
    const target = window as TestWindow;
    const audio = target.__cadenceflow_audio__;
    const piano = audio?.HqSamplePianoProvider?.prototype;
    const melody = audio?.MelodySoundFontProvider?.prototype;
    if (!piano || !melody) throw new Error("The guarded audio test hooks are unavailable");
    target.__keyboardAudioTime = 40;
    target.__keyboardScheduled = [];
    const clock: Clock = { now: () => target.__keyboardAudioTime ?? 0 };
    const schedule = function (this: { readonly id: string }, events: readonly AudioEvent[]) {
      const record: PlaybackRecord = {
        provider: this.id,
        events: [...events],
        scheduledAt: (target.__keyboardAudioTime ?? 0) + 0.25,
        cancelled: false,
      };
      target.__keyboardScheduled!.push(record);
      return {
        id: `keyboard-preview-${target.__keyboardScheduled!.length}`,
        scheduledAt: record.scheduledAt,
        cancel: () => {
          record.cancelled = true;
        },
      };
    };
    for (const prototype of [piano, melody]) {
      Object.defineProperty(prototype, "state", {
        configurable: true,
        get: () => "ready",
      });
      Object.defineProperty(prototype, "clock", {
        configurable: true,
        get: () => clock,
      });
    }
    piano.prepare = async () => {};
    piano.schedule = schedule;
    melody.prepare = async () => {};
    melody.prepareForInstruments = async (instruments) => ({
      ready: [...instruments],
      unavailable: [],
      failed: [],
    });
    melody.schedulePreview = schedule;
    melody.setPreviewSettings = () => {};
  });

  type Schedule = {
    readonly provider: string;
    readonly events: readonly {
      readonly pitch: number;
      readonly startSeconds: number;
      readonly durationSeconds: number;
      readonly channelRole: string;
    }[];
    readonly scheduledAt: number;
    readonly cancelled: boolean;
  };
  const schedules = () =>
    page.evaluate(
      () => (window as Window & { __keyboardScheduled?: Schedule[] }).__keyboardScheduled ?? [],
    );
  const activePitches = () =>
    page
      .locator('.playback-key[data-active="true"]')
      .evaluateAll((keys) =>
        keys.map((key) => Number(key.getAttribute("data-midi"))).sort((a, b) => a - b),
      );
  const advanceToFirstAttack = async (records: readonly Schedule[]) => {
    const earliest = Math.min(
      ...records.flatMap((record) => record.events.map((event) => event.startSeconds)),
    );
    const now = records[0]!.scheduledAt + earliest + 0.001;
    await page.evaluate((audioTime) => {
      (window as Window & { __keyboardAudioTime?: number }).__keyboardAudioTime = audioTime;
    }, now);
    return now;
  };
  const activeAt = (records: readonly Schedule[], now: number, melodyOnly = false) =>
    [
      ...new Set(
        records.flatMap((record) =>
          record.events
            .filter(
              (event) =>
                record.scheduledAt + event.startSeconds <= now &&
                now < record.scheduledAt + event.startSeconds + event.durationSeconds &&
                event.channelRole !== "metronome" &&
                (!melodyOnly || event.channelRole === "melody"),
            )
            .map((event) => event.pitch),
        ),
      ),
    ].sort((a, b) => a - b);

  const chord = page.locator('.piano-roll-chord[data-source-step-id="chord-a"]');
  await expect(chord).toBeVisible();
  await chord.click();
  await expect.poll(async () => (await schedules()).length).toBe(1);
  const chordSchedule = (await schedules())[0]!;
  await expect.poll(() => activePitches()).toEqual([]);
  const chordTime = await advanceToFirstAttack([chordSchedule]);
  await expect.poll(() => activePitches()).toEqual(activeAt([chordSchedule], chordTime));
  const chordPitches = activeAt([chordSchedule], chordTime);
  for (const [width, height] of [
    [640, 360],
    [1280, 720],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await expect.poll(() => activePitches()).toEqual(chordPitches);
    await page.screenshot({
      path: testInfo.outputPath(`keyboard-preview-${width}x${height}-active.png`),
    });
  }
  expect((await schedules())[0]?.events.every((event) => event.channelRole !== "melody")).toBe(
    true,
  );

  const melodyNote = page.locator("button.piano-roll-note[data-source-step-id='chord-a']").first();
  await melodyNote.scrollIntoViewIfNeeded();
  await expect(melodyNote).toBeVisible();
  await melodyNote.click({ force: true });
  await expect.poll(async () => (await schedules()).length).toBe(2);
  const noteSchedule = (await schedules())[1]!;
  expect(noteSchedule.events).toHaveLength(1);
  expect(noteSchedule.events[0]?.channelRole).toBe("melody");
  expect(noteSchedule.cancelled).toBe(false);
  expect((await schedules())[0]?.cancelled).toBe(true);
  await expect.poll(() => activePitches()).toEqual([]);
  const noteTime = await advanceToFirstAttack([noteSchedule]);
  await expect.poll(() => activePitches()).toEqual(activeAt([noteSchedule], noteTime));

  await page.getByTestId("piano-roll-audition-measure").first().click();
  await expect.poll(async () => (await schedules()).length).toBeGreaterThanOrEqual(4);
  const measureSchedules = (await schedules()).slice(2);
  expect(measureSchedules.map((record) => record.provider)).toContain("hq-sample-piano");
  expect(measureSchedules.map((record) => record.provider)).toContain("fluidr3-gm-melody-samples");
  expect((await schedules())[1]?.cancelled).toBe(true);
  await expect.poll(() => activePitches()).toEqual([]);
  const measureTime = await advanceToFirstAttack(measureSchedules);
  await expect.poll(() => activePitches()).toEqual(activeAt(measureSchedules, measureTime));
  await page.getByLabel("Keyboard notes").selectOption("melody");
  await expect.poll(() => activePitches()).toEqual(activeAt(measureSchedules, measureTime, true));
  await page.getByLabel("Keyboard notes").selectOption("all");

  const beforeSystem = (await schedules()).length;
  await page.getByTestId("score-system-audition-0").click();
  await expect.poll(async () => (await schedules()).length).toBeGreaterThan(beforeSystem);
  const systemSchedules = (await schedules()).slice(beforeSystem);
  await expect.poll(() => activePitches()).toEqual([]);
  const systemTime = await advanceToFirstAttack(systemSchedules);
  await expect.poll(() => activePitches()).toEqual(activeAt(systemSchedules, systemTime));
  for (const record of (await schedules()).slice(0, beforeSystem))
    expect(record.cancelled).toBe(true);
  for (const record of systemSchedules) expect(record.cancelled).toBe(false);
  await page.getByTestId("progression-view-btn-staff").click();
  await expect
    .poll(async () => (await schedules()).slice(beforeSystem).every((record) => record.cancelled))
    .toBe(true);
  await expect.poll(() => activePitches()).toEqual([]);
});

test("auto range stays frozen when hidden during playback and recomputes after stop", async ({
  page,
}) => {
  const source = createPianoRollSystemChordFixture("playback-keyboard-range-fixture");
  const firstChord = source.progression.steps.find((step) => step.kind === "chord");
  if (!firstChord) throw new Error("The keyboard range fixture has no chord.");
  const { temporaryBranch: _temporaryBranch, ...sourceWithoutBranch } = source;
  const { loopRegion: _loopRegion, ...progressionWithoutLoop } = source.progression;
  const fixture: Project = Object.freeze({
    ...sourceWithoutBranch,
    progression: Object.freeze({
      ...progressionWithoutLoop,
      steps: Object.freeze([firstChord]),
      selectedStepId: firstChord.id,
      sections: Object.freeze([{ id: "verse", name: "Verse", startStepId: firstChord.id }]),
    }),
  });
  const shiftedFixture: Project = {
    ...fixture,
    progression: {
      ...fixture.progression,
      steps: [
        {
          ...firstChord,
          performance: { ...firstChord.performance, register: 2 },
        },
      ],
    },
  };
  await setup(page, fixture);
  const initialRange = compositionKeyboardRange(fixture);
  const expectedRange = compositionKeyboardRange(shiftedFixture);
  expect(expectedRange).not.toEqual(initialRange);

  await page.getByRole("button", { name: "Show keyboard", exact: true }).first().click();
  const keyboard = page.getByRole("region", { name: "Playback piano keyboard" });
  const readRange = () =>
    keyboard
      .locator(".playback-key")
      .evaluateAll((keys) => [
        Number(keys[0]?.getAttribute("data-midi")),
        Number(keys.at(-1)?.getAttribute("data-midi")),
      ]);
  expect(await readRange()).toEqual(initialRange);

  await page.getByLabel("Tempo in BPM").fill("30");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close keyboard" }).click();
  await page.getByRole("button", { name: "Register offset: +2 Octaves" }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show keyboard", exact: true }).first().click();
  await expect(keyboard).toBeVisible();
  expect(await readRange()).toEqual(initialRange);

  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect.poll(readRange).toEqual(expectedRange);
});
test("keyboard reserves space above status bar in both themes and all target sizes", async ({
  page,
}, testInfo) => {
  await setup(page);
  await page.getByRole("button", { name: "Show keyboard", exact: true }).first().click();
  await page.getByLabel("Keyboard range").selectOption("88");
  for (const [width, height] of [
    [640, 360],
    [1280, 720],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    for (const theme of ["Light", "Dark"]) {
      await page.getByRole("button", { name: `${theme} theme`, exact: true }).click();
      const geometry = await page.evaluate(() => {
        const grid = document.querySelector(".studio-grid")!.getBoundingClientRect();
        const keyboard = document.querySelector(".playback-keyboard")!.getBoundingClientRect();
        const status = document.querySelector(".app-status-bar")!.getBoundingClientRect();
        return {
          gridBottom: grid.bottom,
          gridHeight: grid.height,
          keyboardTop: keyboard.top,
          keyboardBottom: keyboard.bottom,
          statusTop: status.top,
          statusBottom: status.bottom,
          height: innerHeight,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(geometry.gridBottom).toBeLessThanOrEqual(geometry.keyboardTop + 1);
      expect(geometry.keyboardBottom).toBeLessThanOrEqual(geometry.statusTop + 1);
      expect(geometry.statusBottom).toBeLessThanOrEqual(geometry.height + 1);
      expect(geometry.gridHeight).toBeGreaterThan(25);
      expect(geometry.overflow).toBe(false);
      await page.screenshot({
        path: testInfo.outputPath(`${width}x${height}-${theme.toLowerCase()}.png`),
      });
    }
  }
});

test("independent bass toggle persists and chord preview follows the enabled voice", async ({
  page,
}) => {
  const source = createPianoRollSystemChordFixture("playback-keyboard-independent-bass");
  const sourceChord = source.progression.steps.find((step) => step.id === "chord-a");
  if (!sourceChord || sourceChord.kind !== "chord")
    throw new Error("The independent bass fixture has no first chord.");
  const chord = {
    ...sourceChord,
    performance: {
      ...sourceChord.performance,
      inversion: 1 as const,
      bass: {
        choice: "custom" as const,
        octaveOffset: "auto" as const,
        customPitch: exactPitch(48, { step: "C", alter: 0 }),
      },
    },
  };
  const fixture = {
    ...source,
    independentBassEnabled: false,
    progression: {
      ...source.progression,
      selectedStepId: chord.id,
      steps: source.progression.steps.map((step) => (step.id === chord.id ? chord : step)),
    },
  };

  await page.addInitScript(() => {
    const target = window as Window & {
      __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean;
      __CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__?: boolean;
    };
    target.__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
    target.__CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__ = true;
  });
  await setup(page, fixture);
  const keyboardButton = page.getByRole("button", { name: "Show keyboard", exact: true }).first();
  if (!(await page.getByRole("region", { name: "Playback piano keyboard" }).count()))
    await keyboardButton.click();
  await page.getByLabel("Keyboard range").selectOption("88");

  const toggle = page.getByTestId("independent-bass-toggle");
  const inspector = page.getByTestId("chord-properties-inspector");
  const stepBass = inspector.getByTestId("chord-properties-bass");
  await expect(stepBass).toBeDisabled();
  await expect(inspector.getByTestId("chord-properties-inversion")).toHaveValue("1");
  const progressionSettings = page.getByTestId("selected-progression-settings");
  const revealBassToggle = async () => {
    if (!(await progressionSettings.evaluate((details) => (details as HTMLDetailsElement).open)))
      await progressionSettings.locator(":scope > summary").click();
    await expect(toggle).toBeVisible();
  };
  await revealBassToggle();
  await expect(toggle).not.toBeChecked();

  await toggle.check();
  await expect(stepBass).toBeEnabled();
  await expect(toggle).toBeChecked();
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: /Undo/ })
    .click();
  await expect(toggle).not.toBeChecked();
  await expect(stepBass).toBeDisabled();
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: /Redo/ })
    .click();
  await expect(toggle).toBeChecked();
  await expect(stepBass).toBeEnabled();

  const exportedProject = async () => {
    await page.getByTestId("export-menu-toggle").click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menu", { name: "Export menu" }).getByTestId("project-export-btn").click();
    const downloadPath = await (await downloadPromise).path();
    if (!downloadPath) throw new Error("Portable export did not provide a local file.");
    return decodePortableProject(await readFile(downloadPath, "utf8"));
  };
  expect((await exportedProject()).independentBassEnabled).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const hooks = (
          window as Window & {
            __cadenceflow_persistence__?: {
              readonly lastScheduledProjectSnapshot: string;
              readonly lastCompletedProjectSnapshot: string;
            };
          }
        ).__cadenceflow_persistence__;
        if (!hooks || hooks.lastScheduledProjectSnapshot !== hooks.lastCompletedProjectSnapshot)
          return null;
        return (
          JSON.parse(hooks.lastCompletedProjectSnapshot) as { independentBassEnabled?: boolean }
        ).independentBassEnabled;
      }),
    )
    .toBe(true);

  type ScheduledRecord = {
    readonly provider: string;
    readonly events: readonly {
      readonly pitch: number;
      readonly startSeconds: number;
      readonly durationSeconds: number;
      readonly channelRole: string;
    }[];
    readonly scheduledAt: number;
    readonly cancelled: boolean;
  };
  const installScheduleSpy = async () =>
    page.evaluate(() => {
      type AudioEvent = {
        readonly pitch: number;
        readonly startSeconds: number;
        readonly durationSeconds: number;
        readonly channelRole: string;
      };
      type Record = {
        readonly provider: string;
        readonly events: readonly AudioEvent[];
        readonly scheduledAt: number;
        cancelled: boolean;
      };
      type Clock = { now(): number };
      type ProviderPrototype = {
        state?: string;
        prepare?: () => Promise<void>;
        prepareForInstruments?: (instruments: readonly string[]) => Promise<{
          readonly ready: readonly string[];
          readonly unavailable: readonly string[];
          readonly failed: readonly string[];
        }>;
        schedule?: (events: readonly AudioEvent[], clock: Clock) => unknown;
        schedulePreview?: (events: readonly AudioEvent[], clock: Clock) => unknown;
        setPreviewSettings?: () => void;
      };
      type Target = Window & {
        __cadenceflow_audio__?: {
          HqSamplePianoProvider?: { prototype: ProviderPrototype };
          MelodySoundFontProvider?: { prototype: ProviderPrototype };
        };
        __keyboardAudioTime?: number;
        __keyboardScheduled?: Record[];
      };
      const target = window as Target;
      const piano = target.__cadenceflow_audio__?.HqSamplePianoProvider?.prototype;
      const melody = target.__cadenceflow_audio__?.MelodySoundFontProvider?.prototype;
      if (!piano || !melody) throw new Error("The guarded audio test hooks are unavailable.");
      target.__keyboardAudioTime = 40;
      target.__keyboardScheduled = [];
      const clock: Clock = { now: () => target.__keyboardAudioTime ?? 0 };
      const schedule = function (this: { readonly id: string }, events: readonly AudioEvent[]) {
        const record: Record = {
          provider: this.id,
          events: [...events],
          scheduledAt: (target.__keyboardAudioTime ?? 0) + 0.25,
          cancelled: false,
        };
        target.__keyboardScheduled!.push(record);
        return {
          id: `independent-bass-preview-${target.__keyboardScheduled!.length}`,
          scheduledAt: record.scheduledAt,
          cancel: () => {
            record.cancelled = true;
          },
        };
      };
      for (const prototype of [piano, melody]) {
        Object.defineProperty(prototype, "state", {
          configurable: true,
          get: () => "ready",
        });
        Object.defineProperty(prototype, "clock", {
          configurable: true,
          get: () => clock,
        });
      }
      piano.prepare = async () => {};
      piano.schedule = schedule;
      melody.prepare = async () => {};
      melody.prepareForInstruments = async (instruments) => ({
        ready: [...instruments],
        unavailable: [],
        failed: [],
      });
      melody.schedulePreview = schedule;
      melody.setPreviewSettings = () => {};
    });
  const readSchedules = () =>
    page.evaluate(
      () =>
        (window as Window & { __keyboardScheduled?: ScheduledRecord[] }).__keyboardScheduled ?? [],
    );
  const activePitches = () =>
    page
      .locator('.playback-key[data-active="true"]')
      .evaluateAll((keys) =>
        keys.map((key) => Number(key.getAttribute("data-midi"))).sort((a, b) => a - b),
      );

  await page.reload();
  await revealBassToggle();
  await expect(toggle).toBeChecked();
  const chordButton = page.locator('button.piano-roll-chord[data-source-step-id="chord-a"]');
  await expect(stepBass).toBeEnabled();
  await expect(inspector.getByTestId("chord-properties-inversion")).toHaveValue("1");
  await chordButton.scrollIntoViewIfNeeded();
  await installScheduleSpy();
  await chordButton.click();
  await expect.poll(async () => (await readSchedules()).length).toBeGreaterThan(0);
  const enabledRecords = await readSchedules();
  const enabledBass = enabledRecords.flatMap((record) =>
    record.events.filter((event) => event.channelRole === "bass"),
  );
  expect(enabledBass.map((event) => event.pitch)).toContain(48);
  const enabledUpper = enabledRecords
    .flatMap((record) => record.events)
    .filter((event) => event.channelRole === "upper")
    .map((event) => event.pitch)
    .sort((a, b) => a - b);
  expect(enabledUpper.length).toBeGreaterThan(0);
  const bassEvent = enabledRecords.flatMap((record) =>
    record.events
      .filter((event) => event.channelRole === "bass" && event.pitch === 48)
      .map((event) => ({ record, event })),
  )[0];
  if (!bassEvent) throw new Error("Enabled chord preview did not schedule the custom bass.");
  await page.evaluate(
    (audioTime) => {
      (window as Window & { __keyboardAudioTime?: number }).__keyboardAudioTime = audioTime;
    },
    bassEvent.record.scheduledAt + bassEvent.event.startSeconds + 0.01,
  );
  await expect.poll(() => activePitches()).toContain(48);

  await toggle.uncheck();
  await expect(stepBass).toBeDisabled();
  await expect(inspector.getByTestId("chord-properties-inversion")).toHaveValue("1");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const hooks = (
          window as Window & {
            __cadenceflow_persistence__?: {
              readonly lastScheduledProjectSnapshot: string;
              readonly lastCompletedProjectSnapshot: string;
            };
          }
        ).__cadenceflow_persistence__;
        if (!hooks || hooks.lastScheduledProjectSnapshot !== hooks.lastCompletedProjectSnapshot)
          return null;
        return (
          JSON.parse(hooks.lastCompletedProjectSnapshot) as { independentBassEnabled?: boolean }
        ).independentBassEnabled;
      }),
    )
    .toBe(false);
  expect((await exportedProject()).independentBassEnabled).toBe(false);
  await page.reload();
  await revealBassToggle();
  await expect(toggle).not.toBeChecked();
  await expect(stepBass).toBeDisabled();
  await expect(inspector.getByTestId("chord-properties-inversion")).toHaveValue("1");
  await chordButton.scrollIntoViewIfNeeded();
  await installScheduleSpy();
  await chordButton.click();
  await expect.poll(async () => (await readSchedules()).length).toBeGreaterThan(0);
  const disabledRecords = await readSchedules();
  const disabledEvents = disabledRecords.flatMap((record) => record.events);
  expect(disabledEvents.some((event) => event.channelRole === "bass")).toBe(false);
  expect(
    disabledEvents
      .filter((event) => event.channelRole === "upper")
      .map((event) => event.pitch)
      .sort((a, b) => a - b),
  ).toEqual(enabledUpper);
  const earliestUpper = disabledRecords
    .flatMap((record) =>
      record.events
        .filter((event) => event.channelRole === "upper")
        .map((event) => record.scheduledAt + event.startSeconds),
    )
    .sort((a, b) => a - b)[0];
  if (earliestUpper === undefined) throw new Error("Disabled chord preview has no upper notes.");
  await page.evaluate((audioTime) => {
    (window as Window & { __keyboardAudioTime?: number }).__keyboardAudioTime = audioTime;
  }, earliestUpper + 0.01);
  await expect.poll(() => activePitches()).not.toContain(48);
  await expect
    .poll(
      async () => (await activePitches()).filter((pitch) => enabledUpper.includes(pitch)).length,
    )
    .toBeGreaterThan(0);
});
