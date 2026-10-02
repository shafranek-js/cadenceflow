import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (
      window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
});

test("Staff and rhythmic TAB follow the audio clock through melody silence", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });

  const fixture = await readFile(
    new URL("../fixtures/staff-guitar-first.cadenceflow", import.meta.url),
  );
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: "staff-guitar-first.cadenceflow",
    mimeType: "application/json",
    buffer: fixture,
  });
  await expect(page.getByTestId("project-menu-toggle")).toContainText("first", {
    timeout: 30_000,
  });

  const viewSelector = page.getByLabel("Progression Card View");
  await viewSelector.selectOption("staff");
  const tiedG4AndRest = page.locator(
    '.score-system[aria-label="Score system 4, measures 7 through 8"]',
  );
  const systemEntries = await tiedG4AndRest.locator("[data-staff-entry]").evaluateAll((entries) =>
    entries.map((entry) => ({
      key: entry.getAttribute("data-staff-entry"),
      source: entry.getAttribute("data-source-event-keys"),
      x: entry.getBoundingClientRect().left,
    })),
  );
  const tiedG4Continuation = systemEntries.find(
    (entry) =>
      entry.key?.includes("2c5d963f") &&
      entry.key.endsWith(":m7") &&
      entry.source?.includes("2c5d963f"),
  );
  const followingRest = systemEntries.find((entry) => entry.key === "virtual-gap:tail:2:m7");
  expect(tiedG4Continuation).toBeDefined();
  expect(followingRest).toBeDefined();
  const tieToRestSpacing = followingRest!.x - tiedG4Continuation!.x;
  expect(tieToRestSpacing).toBeGreaterThan(20);
  await page.getByRole("button", { name: "Toggle Loop" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();

  const playhead = page.locator(".score-system-playhead:visible").first();
  await expect(playhead).toBeVisible({ timeout: 10_000 });
  const firstX = await playhead.evaluate((element) => element.getBoundingClientRect().left);
  await page.waitForTimeout(250);
  const movedX = await playhead.evaluate((element) => element.getBoundingClientRect().left);
  expect(movedX).toBeGreaterThan(firstX + 2);

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const pausedX = await playhead.evaluate((element) => element.getBoundingClientRect().left);
  await page.waitForTimeout(250);
  expect(await playhead.evaluate((element) => element.getBoundingClientRect().left)).toBeCloseTo(
    pausedX,
    0,
  );
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.waitForTimeout(250);
  expect(
    await playhead.evaluate((element) => element.getBoundingClientRect().left),
  ).toBeGreaterThan(pausedX + 2);

  const soundingNotes = page.locator('[data-staff-sounding="true"]');
  await expect(soundingNotes.first()).toBeVisible({ timeout: 5_000 });
  await page.screenshot({ path: testInfo.outputPath("staff-guitar-active-melody-1280x720.png") });
  await page.waitForFunction(
    () => {
      const activeMeasure = [
        ...document.querySelectorAll<HTMLElement>(".score-system-active-measure"),
      ].find((element) => getComputedStyle(element).display !== "none");
      return (
        activeMeasure?.dataset.measureIndex === "4" &&
        document.querySelectorAll('[data-staff-sounding="true"]').length === 0
      );
    },
    undefined,
    { timeout: 20_000 },
  );
  expect(await soundingNotes.count()).toBe(0);
  const playheadDuringSilence = page.locator(".score-system-playhead:visible").first();
  const silenceStartX = await playheadDuringSilence.evaluate(
    (element) => element.getBoundingClientRect().left,
  );
  await page.waitForTimeout(40);
  const silenceEndX = await playheadDuringSilence.evaluate(
    (element) => element.getBoundingClientRect().left,
  );
  expect(silenceEndX).toBeGreaterThan(silenceStartX + 2);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeEnabled();
  const themeGroup = page.getByRole("group", { name: "Theme" });
  const viewCases = [
    { view: "staff", label: "staff" },
    { view: "tablature", label: "tab" },
  ] as const;
  const viewportCases = [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 640, height: 360 },
  ] as const;

  await page.getByRole("button", { name: "Resume", exact: true }).click();

  for (const viewCase of viewCases) {
    await viewSelector.selectOption(viewCase.view);
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
    for (const viewport of viewportCases) {
      await page.setViewportSize(viewport);
      for (const themeName of ["Dark", "Light"] as const) {
        await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
        const currentTheme = await page.locator(":root").getAttribute("data-theme");
        if (currentTheme !== themeName.toLowerCase()) {
          await themeGroup.getByRole("button", { name: `${themeName} theme` }).click();
        }
        await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
        await page.evaluate(() => {
          const activeMeasure = [
            ...document.querySelectorAll<HTMLElement>(".score-system-active-measure"),
          ].find((element) => getComputedStyle(element).display !== "none");
          const system = activeMeasure?.closest<HTMLElement>(".score-system");
          const header = system?.querySelector<HTMLElement>(".score-system-header");
          const scroll = system?.querySelector<HTMLElement>(".score-system-scroll");
          const playhead = system
            ? Array.from(system.querySelectorAll<HTMLElement>(".score-system-playhead")).find(
                (element) => getComputedStyle(element).display !== "none",
              )
            : undefined;
          const playheadLine = playhead?.querySelector<HTMLElement>(".score-system-playhead-line");
          if (!activeMeasure || !system || !header || !scroll || !playheadLine) {
            throw new Error("The active score system, notation viewport, or playhead is missing.");
          }

          const canvas = system.querySelector<HTMLElement>(".score-system-canvas");
          const appHeaderBottom =
            document.querySelector<HTMLElement>(".app-header")?.getBoundingClientRect().bottom ?? 0;
          if (!canvas) throw new Error("The active score system has no notation canvas.");
          const canvasTop = canvas.getBoundingClientRect().top;
          const targetCanvasTop = appHeaderBottom + 8;
          window.scrollBy({ top: canvasTop - targetCanvasTop, behavior: "instant" });

          const scrollRect = scroll.getBoundingClientRect();
          const playheadRect = playheadLine.getBoundingClientRect();
          if (playheadRect.left < scrollRect.left + 8) {
            scroll.scrollLeft -= scrollRect.left + 8 - playheadRect.left;
          } else if (playheadRect.right > scrollRect.right - 8) {
            scroll.scrollLeft += playheadRect.right - scrollRect.right + 8;
          }
        });
        await page.waitForFunction(
          (view) => {
            const activeMeasure = [
              ...document.querySelectorAll<HTMLElement>(".score-system-active-measure"),
            ].find((element) => getComputedStyle(element).display !== "none");
            const system = activeMeasure?.closest<HTMLElement>(".score-system");
            const svg = system?.querySelector<SVGSVGElement>(".score-system-canvas svg");
            const playhead = system
              ? Array.from(system.querySelectorAll<HTMLElement>(".score-system-playhead")).find(
                  (element) => getComputedStyle(element).display !== "none",
                )
              : undefined;
            const playheadLine = playhead?.querySelector<HTMLElement>(
              ".score-system-playhead-line",
            );
            if (!svg || !playheadLine) return false;
            const svgRect = svg.getBoundingClientRect();
            const lineRect = playheadLine.getBoundingClientRect();
            const glyphSelector =
              view === "tablature"
                ? ".vf-tabnote[data-staff-entry]"
                : ".vf-stavenote[data-staff-entry]";
            const visibleGlyphCount = Array.from(
              svg.querySelectorAll<HTMLElement>(glyphSelector),
            ).filter((glyph) => {
              const rect = glyph.getBoundingClientRect();
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                rect.right > 0 &&
                rect.left < window.innerWidth &&
                rect.bottom > 0 &&
                rect.top < window.innerHeight
              );
            }).length;
            return (
              svgRect.width > 0 &&
              svgRect.height > 0 &&
              lineRect.width > 0 &&
              lineRect.bottom > 0 &&
              lineRect.top < window.innerHeight &&
              visibleGlyphCount > 0
            );
          },
          viewCase.view,
          { timeout: 5_000 },
        );
        const captureEvidence = await page.evaluate((view) => {
          const activeMeasure = [
            ...document.querySelectorAll<HTMLElement>(".score-system-active-measure"),
          ].find((element) => getComputedStyle(element).display !== "none");
          const system = activeMeasure?.closest<HTMLElement>(".score-system");
          const svg = system?.querySelector<SVGSVGElement>(".score-system-canvas svg");
          const playhead = system
            ? Array.from(system.querySelectorAll<HTMLElement>(".score-system-playhead")).find(
                (element) => getComputedStyle(element).display !== "none",
              )
            : undefined;
          const playheadLine = playhead?.querySelector<HTMLElement>(".score-system-playhead-line");
          if (!system || !svg || !playheadLine) return { glyphs: 0, playheadHeight: 0 };
          const glyphSelector =
            view === "tablature"
              ? ".vf-tabnote[data-staff-entry]"
              : ".vf-stavenote[data-staff-entry]";
          const visibleGlyphs = Array.from(svg.querySelectorAll<HTMLElement>(glyphSelector)).filter(
            (glyph) => {
              const rect = glyph.getBoundingClientRect();
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                rect.right > 0 &&
                rect.left < window.innerWidth &&
                rect.bottom > 0 &&
                rect.top < window.innerHeight
              );
            },
          ).length;
          const lineRect = playheadLine.getBoundingClientRect();
          const scoreRect = svg.getBoundingClientRect();
          return {
            glyphs: visibleGlyphs,
            playheadHeight: Math.max(
              0,
              Math.min(lineRect.bottom, window.innerHeight) - Math.max(lineRect.top, 0),
            ),
            scoreHeight: Math.max(
              0,
              Math.min(scoreRect.bottom, window.innerHeight) - Math.max(scoreRect.top, 0),
            ),
          };
        }, viewCase.view);
        expect(captureEvidence.glyphs).toBeGreaterThan(0);
        expect(captureEvidence.playheadHeight).toBeGreaterThan(30);
        expect(captureEvidence.scoreHeight).toBeGreaterThan(30);
        await page.screenshot({
          path: testInfo.outputPath(
            `staff-guitar-${viewCase.label}-${viewport.width}x${viewport.height}-${themeName.toLowerCase()}.png`,
          ),
        });
      }
    }
  }

  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.locator(".score-system-playhead:visible")).toHaveCount(0);
  await expect(page.locator('[data-staff-sounding="true"]')).toHaveCount(0);
});

test("Staff playhead and sounding notes follow the clock while piano samples are delayed", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    if (!NativeAudioContext) throw new Error("This browser has no AudioContext implementation");
    const testWindow = window as Window & {
      __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean;
      __staffGuitarTestAudioTime?: number;
    };
    testWindow.__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
    testWindow.__staffGuitarTestAudioTime = 0;
    class ControlledAudioContext extends NativeAudioContext {
      override get currentTime(): number {
        return testWindow.__staffGuitarTestAudioTime ?? 0;
      }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: ControlledAudioContext,
    });
  });

  let releaseSampleGate!: () => void;
  const sampleGate = new Promise<void>((resolve) => {
    releaseSampleGate = resolve;
  });
  let notifySampleRequest!: () => void;
  const sampleRequested = new Promise<void>((resolve) => {
    notifySampleRequest = resolve;
  });
  await page.route("**/audio/piano-hq/samples/**", async (route) => {
    notifySampleRequest();
    await sampleGate;
    await route.continue();
  });

  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
      timeout: 30_000,
    });

    const fixture = await readFile(
      new URL("../fixtures/staff-guitar-first.cadenceflow", import.meta.url),
    );
    await page.getByTestId("project-menu-toggle").click();
    await page.getByTestId("project-open-file-btn").click();
    await page.getByTestId("project-file-input").setInputFiles({
      name: "staff-guitar-first.cadenceflow",
      mimeType: "application/json",
      buffer: fixture,
    });
    await expect(page.getByTestId("project-menu-toggle")).toContainText("first", {
      timeout: 30_000,
    });
    await page.getByLabel("Progression Card View").selectOption("staff");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await sampleRequested;

    const playhead = page.locator(".score-system-playhead:visible").first();
    await expect(playhead).toBeVisible({ timeout: 10_000 });
    const initialX = await playhead.evaluate((element) => element.getBoundingClientRect().left);
    const playbackPerformanceStart = await page.evaluate(() => performance.now());
    await page.waitForTimeout(1_700);
    await page.evaluate((start) => {
      const testWindow = window as Window & { __staffGuitarTestAudioTime?: number };
      testWindow.__staffGuitarTestAudioTime = (performance.now() - start) / 1000;
    }, playbackPerformanceStart);
    await expect
      .poll(() => playhead.evaluate((element) => element.getBoundingClientRect().left))
      .toBeGreaterThan(initialX + 20);
    await expect(page.locator('[data-staff-sounding="true"]')).toHaveCount(1);

    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const pausedX = await playhead.evaluate((element) => element.getBoundingClientRect().left);
    await page.waitForTimeout(150);
    expect(await playhead.evaluate((element) => element.getBoundingClientRect().left)).toBeCloseTo(
      pausedX,
      0,
    );

    const sampleResponse = page.waitForResponse((response) =>
      response.url().includes("/audio/piano-hq/samples/"),
    );
    releaseSampleGate();
    expect((await sampleResponse).status()).toBe(200);

    await page.getByRole("button", { name: "Resume", exact: true }).click();
    const resumedAudioTime = await page.evaluate(() => {
      const testWindow = window as Window & { __staffGuitarTestAudioTime?: number };
      return testWindow.__staffGuitarTestAudioTime ?? 0;
    });
    const resumePerformanceStart = await page.evaluate(() => performance.now());
    await page.waitForTimeout(220);
    await page.evaluate(
      ({ audioTime, performanceStart }) => {
        const testWindow = window as Window & { __staffGuitarTestAudioTime?: number };
        testWindow.__staffGuitarTestAudioTime =
          audioTime + (performance.now() - performanceStart) / 1000;
      },
      { audioTime: resumedAudioTime, performanceStart: resumePerformanceStart },
    );
    await expect
      .poll(() => playhead.evaluate((element) => element.getBoundingClientRect().left))
      .toBeGreaterThan(pausedX + 2);

    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(page.locator(".score-system-playhead:visible")).toHaveCount(0);
    await expect(page.locator('[data-staff-sounding="true"]')).toHaveCount(0);
  } finally {
    releaseSampleGate();
  }
});

test("Staff playhead wraps at a one-measure System loop on the controlled audio clock", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    if (!NativeAudioContext) throw new Error("This browser has no AudioContext implementation");
    const testWindow = window as Window & {
      __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean;
      __staffGuitarTestAudioTime?: number;
    };
    testWindow.__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
    testWindow.__staffGuitarTestAudioTime = 0;
    class ControlledAudioContext extends NativeAudioContext {
      override get currentTime(): number {
        return testWindow.__staffGuitarTestAudioTime ?? 0;
      }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: ControlledAudioContext,
    });
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible({
    timeout: 30_000,
  });
  const fixture = await readFile(
    new URL("../fixtures/staff-guitar-first.cadenceflow", import.meta.url),
  );
  const project = JSON.parse(fixture.toString("utf8")) as {
    readonly presentation: { measuresPerSystem: number };
  };
  const oneMeasureSystemProject = Buffer.from(
    JSON.stringify({
      ...project,
      presentation: { ...project.presentation, measuresPerSystem: 1 },
    }),
    "utf8",
  );
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: "staff-guitar-one-measure-loop.cadenceflow",
    mimeType: "application/json",
    buffer: oneMeasureSystemProject,
  });
  await expect(page.getByTestId("project-menu-toggle")).toContainText("first", {
    timeout: 30_000,
  });
  await page.getByLabel("Progression Card View").selectOption("staff");
  const firstHeader = page.locator(".score-system-header").first();
  await firstHeader.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Loop System" }).click();
  await expect(firstHeader.locator(".score-system-status-tag.loop")).toBeVisible();
  const countIn = page.getByRole("button", { name: "Toggle Count-in" });
  await countIn.click();
  await expect(countIn).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Play", exact: true }).click();
  const playhead = page.locator(".score-system-playhead:visible").first();
  const performanceStart = await page.evaluate(() => performance.now());
  await expect(page.locator(".score-system-playhead:visible")).toHaveCount(0);
  await page.waitForTimeout(1_750);
  await page.evaluate((start) => {
    const testWindow = window as Window & { __staffGuitarTestAudioTime?: number };
    testWindow.__staffGuitarTestAudioTime = (performance.now() - start) / 1000;
  }, performanceStart);
  await expect(page.locator(".score-system-playhead:visible")).toHaveCount(0);
  await page.waitForTimeout(400);
  await page.evaluate((start) => {
    const testWindow = window as Window & { __staffGuitarTestAudioTime?: number };
    testWindow.__staffGuitarTestAudioTime = (performance.now() - start) / 1000;
  }, performanceStart);
  await expect(playhead).toBeVisible({ timeout: 10_000 });
  const initialX = await playhead.evaluate((element) => element.getBoundingClientRect().left);
  await page.waitForTimeout(1_750);
  await page.evaluate((start) => {
    const testWindow = window as Window & { __staffGuitarTestAudioTime?: number };
    testWindow.__staffGuitarTestAudioTime = (performance.now() - start) / 1000;
  }, performanceStart);
  await expect
    .poll(() => playhead.evaluate((element) => element.getBoundingClientRect().left))
    .toBeGreaterThan(initialX + 50);
  const beforeWrapX = await playhead.evaluate((element) => element.getBoundingClientRect().left);

  await page.evaluate(() => {
    (window as Window & { __staffGuitarTestAudioTime?: number }).__staffGuitarTestAudioTime = 4.2;
  });
  await page.waitForTimeout(150);
  await expect
    .poll(() => playhead.evaluate((element) => element.getBoundingClientRect().left))
    .toBeLessThan(beforeWrapX - 50);

  await firstHeader.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Loop System" }).click();
  await expect(firstHeader.locator(".score-system-status-tag.loop")).toHaveCount(0);
  await countIn.click();
  await expect(countIn).toHaveAttribute("aria-pressed", "false");
  const secondSystem = page.getByTestId("progression-score-system").nth(1);
  await secondSystem.locator(".score-system-header").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Play from this System" }).click();
  await expect(secondSystem.locator(".score-system-playhead:visible")).toBeVisible();
  await expect(
    page.getByTestId("progression-score-system").first().locator(".score-system-playhead:visible"),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.locator(".score-system-playhead:visible")).toHaveCount(0);
  await expect(page.locator('[data-staff-sounding="true"]')).toHaveCount(0);
});
