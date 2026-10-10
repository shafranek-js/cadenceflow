import { expect, test } from "@playwright/test";
import { snapshotAuthoredMelodyPhrase, snapshotChordMelody } from "../../src/domain/melody/types";
import { encodePortableProject } from "../../src/persistence/portableProject";
import { musicalDuration } from "../../src/domain/timing/duration";
import { rational } from "../../src/domain/timing/rational";
import { createPianoRollSystemChordFixture } from "../fixtures/piano-roll-system-chord.fixture";
import { ensureMelodyTrackControlsVisible } from "./test-helpers/progression-settings";

test("Piano Roll highlights sounding intervals, overlaps and continuation fragments only", async ({
  page,
}, testInfo) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  const fixture = createPianoRollSystemChordFixture();
  await page.getByTestId("project-file-input").setInputFiles({
    name: "sounding.cadenceflow",
    mimeType: "application/json",
    buffer: Buffer.from(
      encodePortableProject({
        ...fixture,
        globalTiming: { ...fixture.globalTiming, tempoBpm: 30 },
      }),
    ),
  });
  await page.keyboard.press("Escape");
  const active = page.locator("button.piano-roll-note.is-playing");
  const continuationGrid = page.locator(
    '.piano-roll-measure[data-measure-index="1"] .piano-roll-grid',
  );
  await continuationGrid.scrollIntoViewIfNeeded();
  await expect(active).toHaveCount(0);
  await page.evaluate(() => {
    const records: string[][] = [];
    (window as unknown as { soundingRecords: string[][] }).soundingRecords = records;
    const tick = () => {
      const keys = Array.from(
        document.querySelectorAll<HTMLElement>("button.piano-roll-note.is-playing"),
      )
        .map(
          (note) =>
            `${note.dataset.sourceStepId}:${note.dataset.pianoRollEventKey}:${note.closest<HTMLElement>(".piano-roll-measure")?.dataset.measureIndex}`,
        )
        .sort();
      if (JSON.stringify(keys) !== JSON.stringify(records.at(-1))) records.push(keys);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as unknown as { soundingRecords: string[][] }).soundingRecords.some((keys) =>
            keys.includes("chord-b:exact-owner-boundary:1"),
          ),
        ),
      { timeout: 15000 },
    )
    .toBe(true);

  const activeEventKeys = await active.evaluateAll((notes) =>
    Array.from(new Set(notes.map((note) => (note as HTMLElement).dataset.pianoRollEventKey))),
  );
  expect(activeEventKeys).not.toHaveLength(0);

  await continuationGrid.screenshot({ path: testInfo.outputPath("sounding-overlap.png") });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByTestId("transport-status")).toContainText("Paused");
  await expect(active).toHaveCount(0);
  const records = await page.evaluate(
    () => (window as unknown as { soundingRecords: string[][] }).soundingRecords,
  );
  expect(records).toContainEqual(["chord-a:owner-local-collision:0"]);
  expect(records).toContainEqual(["chord-a:cross-system-carry:0"]);
  expect(records).toContainEqual([
    "chord-a:cross-system-carry:1",
    "chord-b:exact-owner-boundary:1",
    "chord-b:owner-local-collision:1",
  ]);
  const first = records.findIndex((keys) => keys.includes("chord-a:owner-local-collision:0"));
  const late = records.findIndex((keys) => keys.includes("chord-a:cross-system-carry:0"));
  expect(records.slice(first + 1, late)).toContainEqual([]);
  expect(
    records.every(
      (keys) =>
        !keys.includes("chord-a:cross-system-carry:0") ||
        !keys.includes("chord-a:owner-local-collision:0"),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByTestId("transport-status")).toContainText("Playing");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByTestId("transport-status")).toContainText("Stopped");
  await expect(active).toHaveCount(0);
  await testInfo.attach("sounding-intervals", {
    body: JSON.stringify(records, null, 2),
    contentType: "application/json",
  });
  await page.screenshot({ path: testInfo.outputPath("stopped.png"), fullPage: true });
});

test("keeps live note and chord cues through view changes and stops while playing", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 900, height: 620 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  const fixture = createPianoRollSystemChordFixture("playback-view-switch-fixture");
  const firstStep = fixture.progression.steps[0];
  if (firstStep?.kind !== "chord" || firstStep.melody?.mode !== "authored") {
    throw new Error("Expected the sustained playback fixture to start with authored notes.");
  }
  const sustainedFirstStep = Object.freeze({
    ...firstStep,
    melodyInstrumentOverride: "gm-024" as const,
    duration: musicalDuration(rational(64)),
    melody: snapshotChordMelody({
      mode: "authored" as const,
      phrase: snapshotAuthoredMelodyPhrase({
        notes: firstStep.melody.phrase.notes.map((note) =>
          note.id === "cross-system-carry"
            ? { ...note, onset: rational(0), duration: rational(64) }
            : note,
        ),
      }),
    }),
  });
  const { temporaryBranch: _temporaryBranch, ...fixtureWithoutTemporaryBranch } = fixture;
  const { selectedStepId: _selectedStepId, ...progressionWithoutSelectedStep } =
    fixtureWithoutTemporaryBranch.progression;
  const sustainedFixture = {
    ...fixtureWithoutTemporaryBranch,
    melodyTrack: { ...fixture.melodyTrack, instrument: "gm-024" as const },
    globalTiming: { ...fixture.globalTiming, tempoBpm: 120 },
    presentation: { ...fixture.presentation, measuresPerSystem: 1 as const },
    progression: {
      ...progressionWithoutSelectedStep,
      steps: [sustainedFirstStep, ...fixture.progression.steps.slice(1)],
    },
  };
  await page.getByTestId("project-file-input").setInputFiles({
    name: "sustained-playback.cadenceflow",
    mimeType: "application/json",
    buffer: Buffer.from(encodePortableProject(sustainedFixture)),
  });
  await page.keyboard.press("Escape");
  const globalInspector = page.getByTestId("progression-global-inspector");
  await expect(globalInspector).toBeVisible();
  await expect(globalInspector.locator(".global-tracks-disclosure")).toBeAttached({
    timeout: 5000,
  });
  const melodyControls = await ensureMelodyTrackControlsVisible(page);
  await expect(melodyControls).toContainText("Melody audio ready", { timeout: 60000 });
  const showPianoChord = page.getByRole("button", { name: "Show piano chord" });
  if ((await showPianoChord.getAttribute("aria-pressed")) !== "true") await showPianoChord.click();
  const showKeyboard = page.getByRole("button", { name: "Show keyboard", exact: true }).first();
  if ((await showKeyboard.getAttribute("aria-pressed")) !== "true") await showKeyboard.click();
  await expect(page.getByRole("region", { name: "Playback piano keyboard" })).toBeVisible();

  const headerPlayback = page.locator(".app-header-playback-cluster");
  await expect(headerPlayback).toHaveCount(1);
  await expect(headerPlayback.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  const rewindButton = headerPlayback.getByRole("button", {
    name: "Stop and rewind to start",
    exact: true,
  });
  await expect(rewindButton).toBeEnabled();
  await expect(headerPlayback.getByRole("group", { name: "Tempo Controls" })).toBeVisible();
  await expect(headerPlayback.getByRole("group", { name: "Playback Support" })).toBeVisible();
  await expect(page.locator(".progression-heading .progression-transport-controls")).toHaveCount(0);
  await expect(
    page.locator(".progression-heading .piano-roll-progression-selection"),
  ).toBeVisible();
  await expect(page.getByTestId("print-progression")).toBeVisible();
  await expect(page.getByTestId("progression-modulate-trigger")).toBeVisible();
  await expect(page.getByTestId("voice-leading-menu-trigger")).toBeVisible();
  await expect(page.getByTestId("progression-view-btn-piano-roll")).toBeVisible();
  await expect(page.getByTestId("label-hierarchy-control")).toBeVisible();

  const workspace = page.locator(".app-shell > .studio-grid");
  const playbackPosition = () =>
    page.evaluate(() => {
      const marker = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".score-system-playhead, [data-piano-roll-playhead-marker]",
        ),
      ).find((element) => element.style.display === "block");
      const system = marker?.closest<HTMLElement>(".score-system");
      const grid = document.querySelector<HTMLElement>(".app-shell > .studio-grid");
      if (!marker || !system || !grid) return null;
      const gridRect = grid.getBoundingClientRect();
      const systemRect = system.getBoundingClientRect();
      const markerRect = marker.getBoundingClientRect();
      return {
        systemIndex: Number(system.dataset.systemIndex),
        centerError: Math.abs(
          systemRect.top + systemRect.height / 2 - (gridRect.top + gridRect.height / 2),
        ),
        markerVisible:
          markerRect.right >= gridRect.left &&
          markerRect.left <= gridRect.right &&
          markerRect.bottom >= gridRect.top &&
          markerRect.top <= gridRect.bottom,
        pageY: window.scrollY,
      };
    });
  const expectFollowGeometry = async (systemIndex: number) => {
    await expect
      .poll(
        async () => {
          const geometry = await playbackPosition();
          return Boolean(
            geometry &&
            geometry.systemIndex === systemIndex &&
            geometry.centerError < 30 &&
            geometry.markerVisible &&
            geometry.pageY === 0,
          );
        },
        { timeout: 10000 },
      )
      .toBe(true);
  };

  await page.getByRole("button", { name: "Play", exact: true }).click();
  const pianoNotes = page.locator(
    'button.piano-roll-note[data-source-step-id="chord-a"][data-pitch-midi="64"]',
  );
  await expect(pianoNotes.first()).toBeVisible();
  const eventKey = await pianoNotes.first().getAttribute("data-piano-roll-event-key");
  expect(eventKey).not.toBeNull();
  await expect(
    page.locator(
      'button.piano-roll-note.is-playing[data-source-step-id="chord-a"][data-pitch-midi="64"]',
    ),
  ).not.toHaveCount(0, { timeout: 10000 });
  await expect(
    page.locator('.piano-roll-instrument-card.is-playing[data-source-step-index="0"]'),
  ).not.toHaveCount(0);
  await expectFollowGeometry(1);

  const resumeFollow = page.getByRole("button", { name: "Resume follow", exact: true });
  await page.getByTestId("progression-view-btn-staff").click();
  await expect(
    page.locator(`.melody-staff-note.is-active[data-melody-event-key="${eventKey}"]`),
  ).not.toHaveCount(0, { timeout: 5000 });
  await expect(page.getByTestId("transport-status")).toContainText("Playing");
  await expect(resumeFollow).toHaveCount(0);
  await expectFollowGeometry(2);
  await page.getByTestId("progression-view-btn-tablature").click();
  await expect(page.locator(".progression-step-cards")).toHaveAttribute("data-view", "tablature");
  await expect(page.getByTestId("transport-status")).toContainText("Playing");
  await expect(resumeFollow).toHaveCount(0);
  await expectFollowGeometry(3);
  await page.getByTestId("progression-view-btn-piano-roll").click();
  await expect(page.locator(".progression-step-cards")).toHaveAttribute("data-view", "piano-roll");
  await expect(page.getByTestId("transport-status")).toContainText("Playing");
  await expect(resumeFollow).toHaveCount(0);
  const workspaceBounds = await workspace.boundingBox();
  if (!workspaceBounds) throw new Error("The studio workspace has no visible viewport.");
  await page.mouse.move(
    workspaceBounds.x + Math.min(100, workspaceBounds.width / 2),
    workspaceBounds.y + Math.min(80, workspaceBounds.height / 2),
  );
  await page.mouse.wheel(0, 20);
  await expect(resumeFollow).toBeVisible();
  await page.getByTestId("progression-view-btn-staff").click();
  await expect(resumeFollow).toBeVisible();
  await page.getByTestId("progression-view-btn-tablature").click();
  await expect(resumeFollow).toBeVisible();
  await page.getByTestId("progression-view-btn-piano-roll").click();
  await expect(resumeFollow).toBeVisible();
  const manualScrollTop = await workspace.evaluate((element) => element.scrollTop);
  const suspendedSystemIndex = (await playbackPosition())?.systemIndex ?? 0;

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByTestId("transport-status")).toContainText("Paused");
  await expect(page.locator("button.piano-roll-note.is-playing")).toHaveCount(0);
  await expect(resumeFollow).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByTestId("transport-status")).toContainText("Playing");
  await expect(resumeFollow).toBeVisible();
  await expect
    .poll(async () => (await playbackPosition())?.systemIndex ?? suspendedSystemIndex, {
      timeout: 10000,
    })
    .toBeGreaterThan(suspendedSystemIndex);
  await expect
    .poll(() => workspace.evaluate((element) => element.scrollTop), { timeout: 3000 })
    .toBe(manualScrollTop);
  const suspendedScreenshot = testInfo.outputPath("playback-follow-suspended.png");
  await page.screenshot({ path: suspendedScreenshot });
  await testInfo.attach("playback-follow-suspended", {
    path: suspendedScreenshot,
    contentType: "image/png",
  });
  const resumedScreenshot = testInfo.outputPath("playback-follow-resumed.png");
  const resumedSystemIndex = (await playbackPosition())?.systemIndex;
  await resumeFollow.click();
  await expect(resumeFollow).toHaveCount(0);
  await expect
    .poll(
      async () => {
        const geometry = await playbackPosition();
        return Boolean(
          geometry &&
          geometry.systemIndex === resumedSystemIndex &&
          geometry.centerError < 30 &&
          geometry.markerVisible &&
          geometry.pageY === 0,
        );
      },
      { timeout: 5000 },
    )
    .toBe(true);
  await page.screenshot({ path: resumedScreenshot });
  await testInfo.attach("playback-follow-resumed", {
    path: resumedScreenshot,
    contentType: "image/png",
  });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByTestId("transport-status")).toContainText("Stopped");
  await expect(resumeFollow).toHaveCount(0);
  await expect(page.locator("button.piano-roll-note.is-playing")).toHaveCount(0);
  await expect(page.locator('[data-testid="piano-roll-playhead"]')).toHaveCount(0);

  await page.getByTestId("progression-view-btn-staff").click();
  const firstStepSelect = page
    .locator('[data-progression-step-select][data-step-id="chord-a"]')
    .first();
  await firstStepSelect.click();
  await expect(firstStepSelect).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Play From Here", exact: true })).toBeEnabled();
  await page.getByTestId("progression-view-btn-piano-roll").click();

  await page.getByRole("button", { name: "Play From Here", exact: true }).click();
  await expect(page.getByTestId("transport-status")).toContainText("Playing");
  await expect(resumeFollow).toHaveCount(0);
  await rewindButton.click();
  await expect(page.getByTestId("transport-status")).toContainText("Stopped");
  await expect(resumeFollow).toHaveCount(0);
  await expect(page.locator("button.piano-roll-note.is-playing")).toHaveCount(0);
  await expect(page.locator('[data-testid="piano-roll-playhead"]')).toHaveCount(0);
  await expect
    .poll(
      () =>
        workspace.evaluate((element) => {
          const firstSystem = element.querySelector<HTMLElement>(
            '[data-testid="progression-score-system"][data-system-index="0"]',
          );
          const firstScroller = firstSystem?.querySelector<HTMLElement>(".score-system-scroll");
          if (!firstSystem || !firstScroller) return null;
          const workspaceRect = element.getBoundingClientRect();
          const systemRect = firstSystem.getBoundingClientRect();
          return {
            centered:
              Math.abs(
                systemRect.top +
                  systemRect.height / 2 -
                  (workspaceRect.top + workspaceRect.height / 2),
              ) < 30,
            horizontalStart: firstScroller.scrollLeft === 0,
            pageY: window.scrollY,
          };
        }),
      { timeout: 5000 },
    )
    .toEqual({ centered: true, horizontalStart: true, pageY: 0 });
  await rewindButton.click();
  await expect(page.getByTestId("transport-status")).toContainText("Stopped");
  await expect(page.locator('[data-testid="piano-roll-playhead"]')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(headerPlayback).toBeVisible();
  const compactHeader = await page.locator(".app-header").evaluate((element) => {
    const playback = element.querySelector<HTMLElement>(".app-header-playback-cluster");
    const midiButton = element.querySelector<HTMLElement>(
      "button[aria-controls='midi-settings-panel']",
    );
    if (!playback || !midiButton) return null;
    const playbackRect = playback.getBoundingClientRect();
    const midiRect = midiButton.getBoundingClientRect();
    const headerRect = element.getBoundingClientRect();
    const overflowingElements = Array.from(element.querySelectorAll<HTMLElement>("*"))
      .map((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const style = getComputedStyle(candidate);
        return {
          tag: candidate.tagName.toLowerCase(),
          className: typeof candidate.className === "string" ? candidate.className : "",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          scrollWidth: candidate.scrollWidth,
          clientWidth: candidate.clientWidth,
          flex: style.flex,
          minWidth: style.minWidth,
          maxWidth: style.maxWidth,
          overflowX: style.overflowX,
        };
      })
      .filter(
        (candidate) =>
          candidate.left < headerRect.left - 1 || candidate.right > headerRect.right + 1,
      );
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      overflowingElements,
      overlap:
        playbackRect.left < midiRect.right &&
        playbackRect.right > midiRect.left &&
        playbackRect.top < midiRect.bottom &&
        playbackRect.bottom > midiRect.top,
    };
  });
  const compactHeaderScreenshot = testInfo.outputPath("transport-header-compact.png");
  await page.screenshot({ path: compactHeaderScreenshot });
  await testInfo.attach("transport-header-compact", {
    path: compactHeaderScreenshot,
    contentType: "image/png",
  });
  await testInfo.attach("transport-header-compact-layout", {
    body: JSON.stringify(compactHeader, null, 2),
    contentType: "application/json",
  });
  expect(compactHeader).not.toBeNull();
  expect(compactHeader!.scrollWidth).toBeLessThanOrEqual(compactHeader!.clientWidth + 1);
  expect(compactHeader!.overlap).toBe(false);
  await expect(headerPlayback.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(headerPlayback.getByRole("group", { name: "Tempo Controls" })).toBeVisible();
});

test("wraps the compact application menu without clipping header controls", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: "compact-header.cadenceflow",
    mimeType: "application/json",
    buffer: Buffer.from(encodePortableProject(createPianoRollSystemChordFixture())),
  });
  await page.keyboard.press("Escape");

  const header = page.locator(".app-header");
  const playback = page.locator(".app-header-playback-cluster");
  await expect(playback.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(playback.getByRole("group", { name: "Tempo Controls" })).toBeVisible();
  const layout = await header.evaluate((element) => {
    const menu = element.querySelector<HTMLElement>(".app-menu-bar");
    const playbackCluster = element.querySelector<HTMLElement>(".app-header-playback-cluster");
    const midiButton = element.querySelector<HTMLElement>(
      "button[aria-controls='midi-settings-panel']",
    );
    if (!menu || !playbackCluster || !midiButton) return null;
    const rect = element.getBoundingClientRect();
    const playbackRect = playbackCluster.getBoundingClientRect();
    const midiRect = midiButton.getBoundingClientRect();
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      menuBounds: {
        left: Math.round(menu.getBoundingClientRect().left),
        right: Math.round(menu.getBoundingClientRect().right),
        width: Math.round(menu.getBoundingClientRect().width),
      },
      menuItems: Array.from(menu.querySelectorAll<HTMLElement>("button")).map((button) => {
        const buttonRect = button.getBoundingClientRect();
        return {
          label: button.getAttribute("aria-label") ?? button.innerText.trim(),
          left: Math.round(buttonRect.left),
          right: Math.round(buttonRect.right),
        };
      }),
      overflowItems: Array.from(menu.querySelectorAll<HTMLElement>("button"))
        .filter((button) => {
          const buttonRect = button.getBoundingClientRect();
          return buttonRect.left < rect.left - 1 || buttonRect.right > rect.right + 1;
        })
        .map((button) => button.getAttribute("aria-label") ?? button.innerText.trim()),
      overlap:
        playbackRect.left < midiRect.right &&
        playbackRect.right > midiRect.left &&
        playbackRect.top < midiRect.bottom &&
        playbackRect.bottom > midiRect.top,
    };
  });
  const screenshot = testInfo.outputPath("compact-header-layout.png");
  await page.screenshot({ path: screenshot });
  await testInfo.attach("compact-header-layout", {
    path: screenshot,
    contentType: "image/png",
  });
  await testInfo.attach("compact-header-measurements", {
    body: JSON.stringify(layout, null, 2),
    contentType: "application/json",
  });
  expect(layout).not.toBeNull();
  expect(layout!.scrollWidth).toBeLessThanOrEqual(layout!.clientWidth + 1);
  expect(layout!.overflowItems).toEqual([]);
  expect(layout!.overlap).toBe(false);
});
