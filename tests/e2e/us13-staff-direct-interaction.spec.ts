import { expect, test, type Page } from "@playwright/test";
import { ensureHistoryControlsVisible } from "./test-helpers/global-settings";
import { addRestToProgression, setProgressionView } from "./test-helpers/progression-settings";

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (
      window as unknown as { __CADENCEFLOW_ENABLE_TEST_AUDIO__?: boolean }
    ).__CADENCEFLOW_ENABLE_TEST_AUDIO__ = true;
  });
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

function staff(page: Page) {
  return page.getByTestId("progression-score-systems");
}

async function addMelodyToStep(page: Page, stepId: string): Promise<void> {
  const target = staff(page)
    .locator(`.measure-staff-event-select[data-step-id="${stepId}"]`)
    .first();
  await target.click({ button: "right" });
  const menu = page.getByRole("menu", { name: /Melody actions/ });
  await menu.getByRole("menuitem", { name: "Create Melody…" }).click();
  const dialog = page.getByRole("dialog", { name: "Create Melody" });
  await dialog.getByRole("button", { name: "Apply Melody" }).click();
}

async function readMelodyByStep(page: Page): Promise<Record<string, string[]>> {
  return page.locator(".score-system .melody-staff-note").evaluateAll((notes) => {
    const grouped: Record<string, string[]> = {};
    for (const note of notes) {
      const eventKey = note.getAttribute("data-melody-event-key") ?? "";
      const sourceStepId = eventKey.slice(0, eventKey.lastIndexOf(":"));
      (grouped[sourceStepId] ??= []).push(note.getAttribute("aria-label") ?? "");
    }
    for (const labels of Object.values(grouped)) labels.sort();
    return grouped;
  });
}

test.describe("US13 T185 — direct Staff interaction", () => {
  test("selects canonical Chord and Rest targets and preserves inspector history", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await ensureHistoryControlsVisible(page);
    await addChord(page, "I");
    await addChord(page, "V");
    await addRestToProgression(page);
    await setProgressionView(page, "staff");

    const score = staff(page);
    await expect(score.locator(".measure-staff-event-select")).toHaveCount(3);
    await expect(page.locator('[data-view="staff"] [data-testid="progression-step"]')).toHaveCount(
      0,
    );

    const chordTarget = score.locator(".measure-staff-event-select").first();
    const chordStepId = await chordTarget.getAttribute("data-step-id");
    expect(chordStepId).toBeTruthy();
    await chordTarget.click();
    const inspector = page.getByTestId("step-performance-inspector");
    await expect(inspector).toBeVisible();

    const customDuration = inspector.getByRole("textbox", {
      name: "Duration in canonical quarter-note beats",
    });
    await customDuration.fill("3");
    await inspector.getByRole("button", { name: "Set custom duration in beats" }).click();
    await expect(customDuration).toHaveValue("3");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(
      score.locator(`.measure-staff-event-select[data-step-id="${chordStepId}"]`).first(),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(customDuration).toHaveValue("3");
    await expect(
      score.locator(`.measure-staff-event-select[data-step-id="${chordStepId}"]`).first(),
    ).toHaveAttribute("aria-pressed", "true");

    const restTarget = score.getByRole("button", { name: /^Select Rest:/ });
    await restTarget.focus();
    await page.keyboard.press("Space");
    await expect(restTarget).toHaveAttribute("aria-pressed", "true");
    await expect(inspector).toHaveAttribute("aria-label", "Settings for selected Rest step");
  });

  test("opens Melody actions from Staff and restores focus for pointer and keyboard context", async ({
    page,
  }) => {
    await openStudio(page);
    await addChord(page, "I");
    await setProgressionView(page, "staff");

    const target = staff(page).locator(".measure-staff-event-select").first();
    await target.focus();
    await page.keyboard.press("Shift+F10");
    const menu = page.getByRole("menu", { name: /Melody actions/ });
    await expect(menu.getByRole("menuitem", { name: "Create Melody…" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(target).toBeFocused();

    await target.click({ button: "right" });
    await expect(menu.getByRole("menuitem", { name: "Create Melody…" })).toBeVisible();
    await menu.getByRole("menuitem", { name: "Create Melody…" }).click();
    const dialog = page.getByRole("dialog", { name: "Create Melody" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(target).toBeFocused();
  });

  test("keeps Staff selection affordances compact and notation unobscured", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openStudio(page);
    for (const functionId of ["I", "IV", "V", "vi"]) await addChord(page, functionId);
    await setProgressionView(page, "staff");

    const score = staff(page);
    await expect(score.locator(".measure-staff-event-select")).toHaveCount(4);
    await expect(page.locator('[data-view="staff"] [data-testid="progression-step"]')).toHaveCount(
      0,
    );

    const metrics = await score.evaluate((root) => {
      const rect = (element: Element) => {
        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
        };
      };
      const intersects = (
        first: ReturnType<typeof rect>,
        second: ReturnType<typeof rect>,
      ): boolean =>
        first.left < second.right &&
        first.right > second.left &&
        first.top < second.bottom &&
        first.bottom > second.top;
      const targets = [...root.querySelectorAll(".measure-staff-event-select")];
      const notation = [...root.querySelectorAll(".vf-stave path, .vf-stave line")];
      const noteGroups = [...root.querySelectorAll(".vf-stavenote")];
      const targetRects = targets.map(rect);
      const notationRects = notation.map(rect);
      const paintedTargetOverlaps = targets.flatMap((target, targetIndex) => {
        const style = getComputedStyle(target);
        const hasPaint = style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.opacity !== "0";
        if (!hasPaint) return [];
        return notationRects.some((notationRect) =>
          intersects(targetRects[targetIndex]!, notationRect),
        )
          ? [target.getAttribute("data-step-id") ?? String(targetIndex)]
          : [];
      });
      return {
        targetRects,
        paintedTargetOverlaps,
        notationOpacities: [
          ...new Set(noteGroups.map((element) => getComputedStyle(element).opacity)),
        ],
      };
    });

    expect(metrics.targetRects).toHaveLength(4);
    expect(
      metrics.targetRects.every(
        ({ width, height }) => width >= 24 && width <= 32 && height >= 24 && height <= 32,
      ),
    ).toBe(true);
    expect(metrics.paintedTargetOverlaps).toEqual([]);
    expect(metrics.notationOpacities).toEqual(["1"]);

    const systemWidths = await score.locator(".score-system").evaluateAll((systems) =>
      systems.map((system) => {
        const scroll = system.querySelector<HTMLElement>(".score-system-scroll")!;
        const paper = system.querySelector<HTMLElement>(".score-system-paper")!;
        return {
          scrollable: system.getAttribute("data-horizontally-scrollable") === "true",
          availableWidth: scroll.clientWidth,
          paperWidth: paper.getBoundingClientRect().width,
        };
      }),
    );
    expect(systemWidths.length).toBeGreaterThan(1);
    expect(
      systemWidths.every(
        ({ scrollable, availableWidth, paperWidth }) =>
          scrollable || Math.abs(availableWidth - paperWidth) <= 2,
      ),
    ).toBe(true);

    const firstTarget = score.locator(".measure-staff-event-select").first();
    const firstStepId = await firstTarget.getAttribute("data-step-id");
    expect(firstStepId).toBeTruthy();
    await firstTarget.click();
    await expect(firstTarget).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("t185-after.png"), fullPage: true });
  });

  test("handles Staff octave shortcuts for chords, Rest no-op, and continuation identity", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await ensureHistoryControlsVisible(page);
    await addChord(page, "I");
    await addRestToProgression(page);
    await setProgressionView(page, "staff");

    const score = staff(page);
    const inspector = page.getByTestId("step-performance-inspector");
    const target = score.locator(".measure-staff-event-select").first();
    await expect(target).toHaveAttribute(
      "aria-keyshortcuts",
      "ArrowUp ArrowDown ArrowLeft ArrowRight",
    );
    await target.focus();
    await page.keyboard.press("ArrowUp");
    await expect(
      inspector.getByRole("button", { name: "Register offset: +1 Octave" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(target).toBeFocused();

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(inspector.getByRole("button", { name: "Register offset: Auto" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(
      inspector.getByRole("button", { name: "Register offset: +1 Octave" }),
    ).toHaveAttribute("aria-pressed", "true");

    await target.focus();
    await page.keyboard.press("ArrowDown");
    await expect(
      inspector.getByRole("button", { name: "Register offset: 0 (Default)" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(target).toBeFocused();

    const rest = score.getByRole("button", { name: /^Select Rest:/ });
    const idsBeforeRestNoOp = await score
      .locator(".measure-staff-event-select")
      .evaluateAll((targets) => targets.map((target) => target.getAttribute("data-step-id")));
    await rest.focus();
    await page.keyboard.press("ArrowUp");
    await expect(rest).toBeFocused();
    expect(
      await score
        .locator(".measure-staff-event-select")
        .evaluateAll((targets) => targets.map((target) => target.getAttribute("data-step-id"))),
    ).toEqual(idsBeforeRestNoOp);

    await target.click();
    const durationInput = inspector.getByRole("textbox", {
      name: "Duration in canonical quarter-note beats",
    });
    await durationInput.fill("5");
    await inspector.getByRole("button", { name: "Set custom duration in beats" }).click();
    const chordStepId = await target.getAttribute("data-step-id");
    expect(chordStepId).toBeTruthy();
    const continuation = score.locator(
      `.measure-staff-event.is-continuation .measure-staff-event-select[data-step-id="${chordStepId}"]`,
    );
    await expect(continuation).toHaveCount(1);
    await continuation.focus();
    await page.keyboard.press("ArrowUp");
    await expect(
      inspector.getByRole("button", { name: "Register offset: +1 Octave" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(continuation).toBeFocused();
  });

  test("keeps Staff octave edits local to the selected Step and derived Melody", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await addChord(page, "I");
    await addChord(page, "I");
    await addChord(page, "V");
    await setProgressionView(page, "staff");

    const score = staff(page);
    const stepIds = await score.locator(".measure-staff-event-select").evaluateAll((targets) => {
      const ids: string[] = [];
      for (const target of targets) {
        const id = target.getAttribute("data-step-id");
        if (id && !ids.includes(id)) ids.push(id);
      }
      return ids;
    });
    expect(stepIds).toHaveLength(3);
    for (const stepId of stepIds) await addMelodyToStep(page, stepId);
    await expect(score.locator(".melody-staff-note")).not.toHaveCount(0);

    const before = await readMelodyByStep(page);
    const selected = score
      .locator(`.measure-staff-event-select[data-step-id="${stepIds[0]}"]`)
      .first();
    await selected.focus();
    await page.keyboard.press("ArrowUp");
    await expect(
      page.getByTestId("step-performance-inspector").getByRole("button", {
        name: "Register offset: +1 Octave",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(selected).toHaveAttribute("aria-pressed", "true");

    const after = await readMelodyByStep(page);
    expect(after[stepIds[0]!]).not.toEqual(before[stepIds[0]!]);
    for (const stepId of stepIds.slice(1)) expect(after[stepId!]).toEqual(before[stepId!]);
  });

  test("reorders Staff source Steps with arrows, boundaries, repeat guard, and history", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openStudio(page);
    await ensureHistoryControlsVisible(page);
    await addChord(page, "I");
    await addChord(page, "V");
    await addRestToProgression(page);
    await setProgressionView(page, "staff");

    const score = staff(page);
    const readIds = () =>
      score.locator(".measure-staff-event-select").evaluateAll((targets) => {
        const ids: string[] = [];
        for (const target of targets) {
          const id = target.getAttribute("data-step-id");
          if (id && !ids.includes(id)) ids.push(id);
        }
        return ids;
      });
    const originalIds = await readIds();
    expect(originalIds).toHaveLength(3);
    const [firstId, secondId, restId] = originalIds;
    const first = score.locator(`.measure-staff-event-select[data-step-id="${firstId}"]`).first();
    const second = score.locator(`.measure-staff-event-select[data-step-id="${secondId}"]`).first();
    const rest = score.locator(`.measure-staff-event-select[data-step-id="${restId}"]`).first();

    await first.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(first).toBeFocused();
    expect(await readIds()).toEqual(originalIds);

    await second.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(second).toBeFocused();
    expect(await readIds()).toEqual([secondId, firstId, restId]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect(await readIds()).toEqual(originalIds);

    await second.focus();
    await page.keyboard.press("ArrowRight");
    await expect(second).toBeFocused();
    expect(await readIds()).toEqual([firstId, restId, secondId]);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    expect(await readIds()).toEqual(originalIds);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    expect(await readIds()).toEqual([firstId, restId, secondId]);

    await second.focus();
    await second.dispatchEvent("keydown", { key: "ArrowLeft", repeat: true, bubbles: true });
    expect(await readIds()).toEqual([firstId, restId, secondId]);
    await expect(second).toBeFocused();

    await second.focus();
    await page.keyboard.press("ArrowRight");
    await expect(second).toBeFocused();
    expect(await readIds()).toEqual([firstId, restId, secondId]);

    await rest.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(rest).toBeFocused();
    expect(await readIds()).toEqual([restId, firstId, secondId]);
    await rest.focus();
    await page.keyboard.press("ArrowRight");
    await expect(rest).toBeFocused();
    expect(await readIds()).toEqual([firstId, restId, secondId]);
  });

  test("keeps continuation source identity and exposes removal/reorder through the selected inspector", async ({
    page,
  }) => {
    await openStudio(page);
    await addChord(page, "I");
    await addChord(page, "V");
    await addRestToProgression(page);
    await setProgressionView(page, "staff");

    const score = staff(page);
    const firstTarget = score.locator(".measure-staff-event-select").first();
    const firstStepId = await firstTarget.getAttribute("data-step-id");
    expect(firstStepId).toBeTruthy();
    await firstTarget.click();
    const inspector = page.getByTestId("step-performance-inspector");
    const durationInput = inspector.getByRole("textbox", {
      name: "Duration in canonical quarter-note beats",
    });
    await durationInput.fill("5");
    await inspector.getByRole("button", { name: "Set custom duration in beats" }).click();

    const continuation = score.locator(
      `.measure-staff-event.is-continuation .measure-staff-event-select[data-step-id="${firstStepId}"]`,
    );
    await expect(continuation).toHaveCount(1);
    await continuation.focus();
    await page.keyboard.press("Enter");
    await expect(continuation).toHaveAttribute("aria-pressed", "true");

    const uniqueStepIds = await score
      .locator(".measure-staff-event-select")
      .evaluateAll((buttons) => {
        const ids: string[] = [];
        for (const button of buttons) {
          const id = button.getAttribute("data-step-id");
          if (id && !ids.includes(id)) ids.push(id);
        }
        return ids;
      });
    expect(uniqueStepIds).toHaveLength(3);
    const secondStepId = uniqueStepIds.find((id) => id !== firstStepId)!;
    const restStepId = uniqueStepIds.find((id) => id !== firstStepId && id !== secondStepId)!;

    await score
      .locator(`.measure-staff-event-select[data-step-id="${secondStepId}"]`)
      .first()
      .click();
    await inspector.getByRole("button", { name: "Move step left" }).click();
    await expect(
      score
        .locator(
          `.measure-staff-event.is-selected .measure-staff-event-select[data-step-id="${secondStepId}"]`,
        )
        .first(),
    ).toBeVisible();
    await expect(
      score.locator(`.measure-staff-event-select[data-step-id="${secondStepId}"]`).first(),
    ).toBeFocused();

    await inspector.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(
      score.locator(`.measure-staff-event-select[data-step-id="${secondStepId}"]`),
    ).toHaveCount(1);
    await expect(
      score.locator(`.measure-staff-event-select[data-step-id="${secondStepId}"]`).first(),
    ).toContainText("Rest");

    const rest = score.locator(`.measure-staff-event-select[data-step-id="${restStepId}"]`).first();
    await rest.click();
    await page
      .getByTestId("step-performance-inspector")
      .getByRole("button", { name: "Remove", exact: true })
      .click();
    await expect(
      score.locator(`.measure-staff-event-select[data-step-id="${restStepId}"]`),
    ).toHaveCount(1);
  });
});
