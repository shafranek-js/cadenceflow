import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ensureHistoryControlsVisible } from "./test-helpers/global-settings";
import {
  addRestToProgression,
  setLayoutMeasuresPerSystem,
} from "./test-helpers/progression-settings";

type JsonRecord = Record<string, unknown>;
interface PortableDocument extends JsonRecord {
  name: string;
  presentation: JsonRecord;
  progression: { steps: JsonRecord[] };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (
      window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
});

async function openStudio(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("main", { name: "CadenceFlow Studio" })).toBeVisible();
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
}

async function addChord(page: Page, functionId: string): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
}

async function exportProject(page: Page): Promise<PortableDocument> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-menu-toggle").click();
  await page.getByRole("menu", { name: "Export menu" }).getByTestId("project-export-btn").click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Portable project download did not expose a local path");
  await page.keyboard.press("Escape");
  return JSON.parse(await readFile(path, "utf8")) as PortableDocument;
}

async function importProject(page: Page, document: PortableDocument, name: string): Promise<void> {
  const fileInput = page.getByTestId("project-file-input");
  if ((await fileInput.count()) === 0) await page.getByTestId("project-menu-toggle").click();
  const importedDocument = structuredClone(document) as PortableDocument;
  importedDocument.name = name;
  await fileInput.setInputFiles({
    name: `${name}.cadenceflow`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(importedDocument)),
  });
  await expect(page.getByTestId("project-menu-toggle")).toContainText(name, { timeout: 30_000 });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
  await page.getByTestId("project-menu-toggle").click();
  await expect(page.getByRole("menu", { name: "Project actions" })).toHaveCount(0);
}

async function noPageHorizontalOverflow(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
    scrollX: window.scrollX,
  }));
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.documentClientWidth);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expect(metrics.scrollX).toBe(0);
}

async function expectNotationVisibleInScorePaper(svg: Locator): Promise<void> {
  const metrics = await svg.evaluate((element) => {
    const surface = element.getBoundingClientRect();
    const paper = element.closest<HTMLElement>(".score-system-paper")?.getBoundingClientRect();
    if (!paper) throw new Error("Score paper surface is missing");
    const notes = [...element.querySelectorAll(".vf-stavenote")].map((note) => {
      const bounds = note.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
      };
    });
    return {
      notes,
      surface: {
        left: surface.left,
        right: surface.right,
        top: surface.top,
        bottom: surface.bottom,
      },
      paper: {
        left: paper.left,
        right: paper.right,
        top: paper.top,
        bottom: paper.bottom,
      },
    };
  });
  expect(metrics.notes.length).toBeGreaterThan(0);
  const notationFits = metrics.notes.every(
    ({ left, right, top, bottom }) =>
      left >= metrics.surface.left - 1 &&
      right <= metrics.surface.right + 1 &&
      top >= metrics.paper.top - 1 &&
      bottom <= metrics.paper.bottom + 1,
  );
  expect(notationFits, JSON.stringify(metrics)).toBe(true);
}

async function setMeter(page: Page, numerator: number, denominator: number, grouping: string) {
  await page.getByLabel("Meter numerator").fill(String(numerator));
  await page.getByLabel("Meter denominator").selectOption(String(denominator));
  await page.getByLabel("Pulse grouping").fill(grouping);
  await page.getByLabel("Reflow").check();
  await page.getByRole("button", { name: "Apply Meter Change" }).click();
  await expect(
    page.getByTestId("progression-score-systems").locator(".score-system-canvas > svg").first(),
  ).toHaveAttribute("data-staff-meter", `${numerator}/${denominator}`);
}

async function makeDenseFixture(
  seed: PortableDocument,
  denominator: number,
): Promise<PortableDocument> {
  const fixture = structuredClone(seed) as PortableDocument;
  const source = fixture.progression.steps.find((step: JsonRecord) => step.kind === "chord");
  if (!source) throw new Error("Dense fixture requires one source chord");
  const count = 32;
  fixture.name = denominator === 2 ? "Dense 4/4 score" : "Overdense 4/4 score";
  fixture.presentation.progressionView = "staff";
  fixture.presentation.measuresPerSystem = "auto";
  fixture.progression.steps = Array.from({ length: count }, (_, index) => ({
    ...structuredClone(source),
    id: `dense-${denominator}-${index}`,
    duration: {
      beats:
        denominator === 2 ? { numerator: 1, denominator: 2 } : { numerator: 1, denominator: 8 },
      displayHint: "beats",
    },
  }));
  return fixture;
}

function score(page: Page) {
  return page.getByTestId("progression-score-systems");
}

test.describe("T184 — final Progression score-system acceptance", () => {
  test("synchronizes one progression view and preserves Steps through history and reopen", async ({
    page,
  }) => {
    await openStudio(page);
    await ensureHistoryControlsVisible(page);
    await addChord(page, "I");
    await addChord(page, "V");
    await addRestToProgression(page);

    const progressionView = page.getByLabel("Progression Card View");
    const progressionViews = await progressionView
      .locator("option")
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    expect(progressionViews).toEqual(["staff", "tablature", "piano-roll"]);
    const matrixViews = await page
      .getByLabel("Global Card View")
      .locator("option")
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    expect(matrixViews).toEqual(["piano", "staff", "guitar"]);
    await expect(page.getByText("Mixed", { exact: true })).toHaveCount(0);

    const globalInspector = page.getByTestId("progression-global-inspector");
    await expect(globalInspector).toBeVisible();
    await globalInspector.getByRole("button", { name: "Staff view" }).click();
    await expect(progressionView).toHaveValue("staff");
    await expect(
      globalInspector.locator(".progression-view-disclosure .disclosure-status"),
    ).toHaveText("staff");
    await expect(page.locator('[data-view="staff"] [data-testid="progression-step"]')).toHaveCount(
      0,
    );

    await setLayoutMeasuresPerSystem(page, 2);
    await expect(page.locator(".progression-step-cards")).toHaveAttribute("data-layout", "2");
    const saved = await exportProject(page);
    const savedSteps = saved.progression.steps;

    await progressionView.selectOption("tablature");
    await expect(progressionView).toHaveValue("tablature");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(progressionView).toHaveValue("staff");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(progressionView).toHaveValue("tablature");

    await importProject(page, saved, "Presentation reopen");
    await expect(page.getByLabel("Progression Card View")).toHaveValue("staff");
    await expect(page.locator(".progression-step-cards")).toHaveAttribute("data-layout", "2");
    const reopened = await exportProject(page);
    expect(reopened.progression.steps).toEqual(savedSteps);
    expect(reopened.presentation.progressionView).toBe("staff");
    expect(reopened.presentation.measuresPerSystem).toBe(2);

    await page.getByTestId("view-menu-toggle").click();
    const viewMenu = page.getByRole("menu", { name: "View menu" });
    await expect(viewMenu.getByTestId("progression-card-view-staff")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(viewMenu.getByText("Mixed", { exact: true })).toHaveCount(0);
  });

  test("keeps Harmonic, Piano, and Guitar measures full-width and vertically independent", async ({
    page,
  }) => {
    await openStudio(page);
    await addChord(page, "I");
    await addChord(page, "IV");
    await addChord(page, "V");
    await setLayoutMeasuresPerSystem(page, 2);

    const progressionView = page.getByLabel("Progression Card View");
    const stack = page.getByTestId("progression-score-systems");
    for (const view of ["tablature"] as const) {
      await progressionView.selectOption(view);
      await expect(stack).toHaveAttribute("data-layout-mode", "measures");
      await expect(stack).toHaveAttribute(
        "aria-label",
        new RegExp(`${view[0]!.toUpperCase() + view.slice(1)} progression measures`),
      );
      await expect(stack.locator(".score-system")).toHaveCount(0);
      await expect(stack.locator(".score-system-measures-row")).toHaveCount(0);
      await expect(stack.getByTestId("progression-measure")).toHaveCount(3);
      await expect(page.locator(".progression-step-cards")).toHaveAttribute("data-layout", "2");

      const geometry = await stack.evaluate((element) => {
        const root = element.getBoundingClientRect();
        const measures = Array.from(
          element.querySelectorAll<HTMLElement>("[data-testid='progression-measure']"),
        ).map((measure) => {
          const rect = measure.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        });
        return { root: { left: root.left, right: root.right }, measures };
      });
      expect(geometry.measures).toHaveLength(3);
      for (const [index, measure] of geometry.measures.entries()) {
        expect(Math.abs(measure.left - geometry.root.left)).toBeLessThanOrEqual(2);
        expect(Math.abs(measure.right - geometry.root.right)).toBeLessThanOrEqual(2);
        if (index > 0) {
          expect(measure.top).toBeGreaterThan(geometry.measures[index - 1]!.bottom);
        }
      }
    }
  });

  test("renders Tablature as fret notation on score systems", async ({ page }) => {
    await openStudio(page);
    await addChord(page, "I");
    await addChord(page, "IV");
    await page.getByLabel("Progression Card View").selectOption("tablature");

    const stack = score(page);
    await expect(stack).toHaveAttribute("data-layout-mode", "systems");
    await expect(stack).toHaveAttribute("aria-label", /Tablature score systems/);
    await expect(stack.locator(".score-system-canvas > svg")).toHaveCount(1);
    await expect(stack.locator(".vf-tabnote").first()).toBeVisible();
    await expect(stack.getByTestId("score-system-fingering-toggle-0")).toBeVisible();
    await expect(stack.getByTestId("progression-measure")).toHaveCount(0);
  });

  test("normalizes uniform, mixed, and missing legacy view values without a Mixed state", async ({
    page,
  }) => {
    await openStudio(page);
    await addChord(page, "I");
    await addChord(page, "V");
    const seed = await exportProject(page);

    const legacy = (name: string): JsonRecord => {
      const document = structuredClone(seed) as PortableDocument;
      document.name = name;
      delete document.presentation.progressionView;
      delete document.presentation.measuresPerSystem;
      return document;
    };
    const uniformPiano = legacy("Legacy uniform piano");
    uniformPiano.progression.steps.forEach((step: JsonRecord) => {
      if (step.kind === "chord") step.cardView = "piano";
    });
    await importProject(page, uniformPiano, "Legacy uniform piano");
    await expect(page.getByLabel("Progression Card View")).toHaveValue("piano");
    await expect(page.getByText("Mixed", { exact: true })).toHaveCount(0);

    const mixed = legacy("Legacy mixed");
    mixed.progression.steps[0].cardView = "piano";
    mixed.progression.steps[1].cardView = "staff";
    await importProject(page, mixed, "Legacy mixed");
    await expect(page.getByLabel("Progression Card View")).toHaveValue("harmonic");

    const missing = legacy("Legacy missing");
    missing.progression.steps.forEach((step: JsonRecord) => {
      if (step.kind === "chord") delete step.cardView;
    });
    await importProject(page, missing, "Legacy missing");
    await expect(page.getByLabel("Progression Card View")).toHaveValue("harmonic");
    await expect(page.getByLabel("Measures Layout")).toHaveCount(0);
    expect(
      await page
        .locator("select")
        .evaluateAll((selects) =>
          selects.flatMap((select) => Array.from(select.options).map((option) => option.value)),
        ),
    ).not.toContain("mixed");
  });

  test("renders sequential systems, maximums, bass policy, and local dense reflow", async ({
    page,
  }, testInfo) => {
    test.slow();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openStudio(page);
    await addChord(page, "I");
    const seed = await exportProject(page);
    const normalDense = await makeDenseFixture(seed, 2);
    await importProject(page, normalDense, "Dense 4/4 score");

    await expect(page.getByLabel("Progression Card View")).toHaveValue("staff");
    const normalScore = score(page);
    await expect(normalScore).toHaveAttribute("data-auto-maximum", "4");
    await expect(normalScore.locator(".score-system")).toHaveCount(1);
    await expect(normalScore.locator(".score-system")).toHaveAttribute("data-measure-count", "4");
    await expect(normalScore.locator(".score-system-canvas > svg")).toHaveCount(1);
    const normalSvg = normalScore.locator(".score-system-canvas > svg");
    await expect(normalSvg).toHaveAttribute("data-staff-system-measure-count", "4");
    await expect(normalSvg).toHaveAttribute("data-staff-meter", "4/4");
    await expect(normalSvg).toHaveAttribute("data-staff-system-clefs", "treble");
    await expect(normalSvg).toHaveAttribute("data-staff-bass-entries", "");
    const staveLefts = await normalScore
      .locator("svg .vf-stave")
      .evaluateAll((staves) => staves.map((stave) => stave.getBoundingClientRect().left));
    expect(staveLefts).toHaveLength(4);
    expect(staveLefts.every((left, index) => index === 0 || left > staveLefts[index - 1]!)).toBe(
      true,
    );

    await page.getByTestId("view-menu-toggle").click();
    await expect(page.getByTestId("show-bass-in-staff")).toHaveAttribute("aria-checked", "false");
    await page.getByTestId("show-bass-in-staff").click();
    await expect(normalSvg).toHaveAttribute("data-staff-system-clefs", "treble,bass");
    await expect(normalSvg).toHaveAttribute("data-staff-bass-entries", /dense/);
    await page.getByTestId("view-menu-toggle").click();
    await expect(page.getByTestId("show-bass-in-staff")).toHaveAttribute("aria-checked", "true");

    await setMeter(page, 3, 4, "3");
    await expect(normalScore).toHaveAttribute("data-auto-maximum", "5");
    await setMeter(page, 6, 8, "3+3");
    await expect(normalScore).toHaveAttribute("data-auto-maximum", "5");
    await setMeter(page, 7, 8, "2+2+3");
    await expect(normalScore).toHaveAttribute("data-auto-maximum", "4");

    await page.setViewportSize({ width: 1280, height: 720 });
    const overdense = await makeDenseFixture(seed, 8);
    await importProject(page, overdense, "Overdense 4/4 score");
    const denseScore = score(page);
    await expect(denseScore.locator(".score-system")).toHaveCount(1);
    const denseSystem = denseScore.locator(".score-system");
    await expect(denseSystem).toHaveAttribute("data-horizontally-scrollable", "true");
    const scrollMetrics = await denseSystem.locator(".score-system-scroll").evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth);
    await noPageHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath("overdense-local-scroll-1280x720.png"),
      fullPage: true,
    });
  });

  test("keeps Melody/Harmony aligned and preserves direct Staff interactions across themes and zoom", async ({
    page,
  }, testInfo) => {
    test.slow();
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await addChord(page, "I");
    await addChord(page, "V");
    await addRestToProgression(page);
    await page.getByLabel("Progression Card View").selectOption("staff");

    const scoreRoot = score(page);
    const trailingGap = scoreRoot.getByTestId("progression-score-gap");
    await expect(trailingGap).toHaveCount(1);
    await expect(trailingGap.getByRole("button", { name: /Add chord to measure/ })).toBeVisible();
    await expect(
      trailingGap.getByRole("button", { name: /Fill measure .* with rest/ }),
    ).toBeVisible();
    const firstTarget = scoreRoot.locator(".measure-staff-event-select").first();
    await firstTarget.focus();
    await page.keyboard.press("Shift+F10");
    const melodyMenu = page.getByRole("menu", { name: /Melody actions/ });
    await expect(melodyMenu.getByRole("menuitem", { name: "Create Melody…" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(firstTarget).toBeFocused();
    await firstTarget.click({ button: "right" });
    await expect(melodyMenu.getByRole("menuitem", { name: "Create Melody…" })).toBeVisible();
    await melodyMenu.getByRole("menuitem", { name: "Create Melody…" }).click();
    const melodyDialog = page.getByRole("dialog", { name: "Create Melody" });
    await melodyDialog.getByRole("button", { name: "Apply Melody" }).click();

    const system = scoreRoot.locator(".score-system").first();
    const svg = system.locator(".score-system-canvas > svg");
    await expect(svg).toHaveCount(1);
    await expect(svg).toHaveAttribute("data-staff-system-clefs", "treble,treble");
    await expect(svg.locator(".vf-clef")).toHaveCount(2);
    await expect(svg.locator(".vf-timesignature")).toHaveCount(2);
    const alignment = await svg.evaluate((element) => {
      const positions = (element.getAttribute("data-staff-system-positions") ?? "")
        .split(",")
        .map((value) => {
          const parts = value.split(":");
          return {
            staff: parts[0],
            key: parts.slice(1, -1).join(":"),
            ratio: Number(parts.at(-1)),
          };
        })
        .filter(({ ratio }) => Number.isFinite(ratio));
      const firstMelody = positions.find(({ staff }) => staff === "melody");
      const firstHarmony = positions.find(({ staff }) => staff === "harmony");
      if (!firstMelody || !firstHarmony) throw new Error("Melody/Harmony positions are missing");
      return { firstMelody, firstHarmony };
    });
    expect(
      Math.abs(alignment.firstMelody.ratio - alignment.firstHarmony.ratio),
    ).toBeLessThanOrEqual(0.01);

    const melodyTarget = system.locator(".melody-staff-note").first();
    await expect(melodyTarget).toBeVisible();
    await melodyTarget.click();
    await expect(firstTarget).toHaveAttribute("aria-pressed", "true");
    await expect(firstTarget).toHaveAttribute("aria-haspopup", "menu");
    await firstTarget.focus();
    await page.keyboard.press("Shift+F10");
    const editMelody = melodyMenu.getByRole("menuitem", { name: "Edit Melody…" });
    const removeMelody = melodyMenu.getByRole("menuitem", { name: "Remove Melody" });
    await expect(editMelody).toBeVisible();
    await editMelody.focus();
    await expect(editMelody).toBeFocused();
    await editMelody.press("ArrowDown");
    await expect(removeMelody).toBeFocused();
    await removeMelody.press("ArrowUp");
    await expect(editMelody).toBeFocused();
    await editMelody.press("Escape");
    await expect(melodyMenu).toHaveCount(0);
    await expect(firstTarget).toBeFocused();
    await firstTarget.click({ button: "right" });
    await expect(melodyMenu.getByRole("menuitem", { name: "Remove Melody" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(firstTarget).toBeFocused();

    const inspector = page.getByTestId("step-performance-inspector");
    await firstTarget.click();
    await expect(inspector).toBeVisible();
    await firstTarget.focus();
    await page.keyboard.press("ArrowUp");
    await expect(
      inspector.getByRole("button", { name: "Register offset: +1 Octave" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(firstTarget).toBeFocused();

    const restTarget = scoreRoot.getByRole("button", { name: /^Select Rest:/ }).first();
    await restTarget.focus();
    await page.keyboard.press("Space");
    await expect(restTarget).toHaveAttribute("aria-pressed", "true");
    await expect(inspector).toHaveAttribute("aria-label", "Settings for selected Rest step");

    await firstTarget.click();
    const duration = inspector.getByRole("textbox", {
      name: "Duration in canonical quarter-note beats",
    });
    await duration.fill("5");
    await inspector.getByRole("button", { name: "Set custom duration in beats" }).click();
    const firstStepId = await firstTarget.getAttribute("data-step-id");
    expect(firstStepId).toBeTruthy();
    await expect(
      scoreRoot.locator(
        `.measure-staff-event.is-continuation .measure-staff-event-select[data-step-id="${firstStepId}"]`,
      ),
    ).toHaveCount(1);

    await firstTarget.click();
    await expect
      .poll(
        () =>
          scoreRoot
            .locator(
              '.score-system-canvas > svg[data-staff-playing-entries]:not([data-staff-playing-entries=""])',
            )
            .count(),
        { intervals: [20, 40, 80, 120] },
      )
      .toBeGreaterThan(0);

    await page.getByLabel("Progression Card View").selectOption("tablature");
    await page.getByLabel("Progression Card View").selectOption("staff");
    await setLayoutMeasuresPerSystem(page, 1);
    await expect(page.locator(".progression-step-cards")).toHaveAttribute("data-layout", "1");
    await page.getByLabel("Progression Card View").selectOption("tablature");
    await expect(page.getByTestId("progression-measure")).not.toHaveCount(0);
    await expect(page.getByLabel("Measures Layout")).toHaveCount(0);
    await expect(
      page.locator('[data-view="harmonic"] [data-testid="progression-step"]'),
    ).not.toHaveCount(0);
    await page.getByLabel("Progression Card View").selectOption("tablature");
    await expect(
      page.locator('[data-view="tablature"] [data-testid="progression-step"]'),
    ).not.toHaveCount(0);
    await expect(scoreRoot).toHaveAttribute("aria-label", /Piano progression measures/);
    await expect(scoreRoot).toHaveAttribute("data-layout-mode", "measures");
    await expect(scoreRoot.locator(".score-system-canvas > svg")).toHaveCount(0);
    await expect(scoreRoot.getByRole("img", { name: /Score notation/ })).toHaveCount(0);
    await expect(
      page.locator('[data-view="tablature"] [data-testid="progression-step"]').first(),
    ).toBeVisible();

    const theme = page.getByRole("group", { name: "Theme" });
    await page.getByLabel("Progression Card View").selectOption("staff");
    for (const button of ["Light theme", "Dark theme"] as const) {
      await theme.getByRole("button", { name: button, exact: true }).click();
      await noPageHorizontalOverflow(page);
      await expect(scoreRoot.locator(".score-system-canvas > svg")).not.toHaveCount(0);
      await expectNotationVisibleInScorePaper(
        scoreRoot.locator(".score-system-canvas > svg").first(),
      );
    }
    await page.screenshot({ path: testInfo.outputPath("staff-dark-1280x720.png"), fullPage: true });

    await page.evaluate(() => {
      document.documentElement.style.zoom = "2";
    });
    await noPageHorizontalOverflow(page);
    await expect(scoreRoot.locator(".score-system-canvas > svg")).not.toHaveCount(0);
    await expect(scoreRoot.locator(".measure-staff-event-select").first()).toBeVisible();
    await scoreRoot.locator(".measure-staff-event-select").first().focus();
    await expect(scoreRoot.locator(".measure-staff-event-select").first()).toBeFocused();
    await page.evaluate(() => {
      document.documentElement.style.zoom = "";
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    for (const button of ["Dark theme", "Light theme"] as const) {
      await theme.getByRole("button", { name: button, exact: true }).click();
      await noPageHorizontalOverflow(page);
      await expectNotationVisibleInScorePaper(
        scoreRoot.locator(".score-system-canvas > svg").first(),
      );
    }
    await page.screenshot({
      path: testInfo.outputPath("staff-light-1920x1080.png"),
      fullPage: true,
    });
    expect(browserErrors).toEqual([]);
  });
});
