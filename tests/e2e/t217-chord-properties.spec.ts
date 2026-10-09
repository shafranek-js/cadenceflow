import { expect, test } from "@playwright/test";
import { addRestToProgression } from "./test-helpers/progression-settings";

async function openStudio(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
}

async function addChord(page: import("@playwright/test").Page, functionId: string): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
}

async function historyAction(
  page: import("@playwright/test").Page,
  action: "Undo" | "Redo",
): Promise<void> {
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) })
    .click();
}

test.describe("T217 — selected chord properties", () => {
  test("edits one selected chord with atomic reset/history across supported views", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (
        window as Window & { __CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__?: boolean }
      ).__CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__ = true;
    });
    await openStudio(page);
    await expect(page.getByTestId("chord-properties-inspector")).toHaveCount(0);

    await addChord(page, "I");
    await addChord(page, "V");
    await page.getByTestId("progression-view-btn-staff").click();
    const steps = page.locator("[data-progression-step-select]");
    await expect(steps).toHaveCount(2);

    await steps.first().click();
    const inspector = page.getByTestId("chord-properties-inspector");
    await expect(inspector).toBeVisible();
    await expect(inspector.getByRole("heading", { name: "Chord Properties" })).toBeVisible();
    await expect(inspector.locator(".chord-properties-function")).toHaveText("I");
    await inspector.getByTestId("chord-properties-type-13").click();
    await expect(inspector.getByTestId("chord-properties-type-13")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await inspector.getByTestId("chord-properties-inversion").selectOption("6");
    await expect(inspector.getByTestId("chord-properties-bass")).toHaveValue("thirteenth");
    await expect(inspector.getByTestId("chord-properties-sounding")).toContainText("A");
    await expect(inspector.getByTestId("chord-properties-reset")).toBeEnabled();

    const sourceStepId = await steps.first().getAttribute("data-step-id");
    if (!sourceStepId) throw new Error("Selected chord has no stable Step ID");
    await expect
      .poll(() =>
        page.evaluate((expectedStepId) => {
          const observable = (
            window as Window & {
              __cadenceflow_persistence__?: {
                lastScheduledProjectSnapshot: string;
                lastCompletedProjectSnapshot: string;
              };
            }
          ).__cadenceflow_persistence__;
          if (
            !observable ||
            observable.lastScheduledProjectSnapshot !== observable.lastCompletedProjectSnapshot
          ) {
            return false;
          }
          const snapshot = JSON.parse(observable.lastCompletedProjectSnapshot) as {
            progression: {
              steps: Array<{
                id: string;
                kind: string;
                harmonicVariant?: { extensions?: number[] };
                performance?: { inversion?: number | string };
                chordPropertiesOrigin?: { source?: unknown };
              }>;
            };
          };
          const savedStep = snapshot.progression.steps.find((step) => step.id === expectedStepId);
          return (
            savedStep?.kind === "chord" &&
            savedStep.harmonicVariant?.extensions?.includes(13) === true &&
            savedStep.performance?.inversion === 6 &&
            Boolean(savedStep.chordPropertiesOrigin?.source)
          );
        }, sourceStepId),
      )
      .toBe(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("chord-properties-type-13")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("chord-properties-inversion")).toHaveValue("6");

    await inspector.getByTestId("chord-properties-reset").click();
    await expect(inspector.getByTestId("chord-properties-type-triad")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(inspector.getByTestId("chord-properties-inversion")).toHaveValue("auto");
    await historyAction(page, "Undo");
    await expect(inspector.getByTestId("chord-properties-type-13")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(inspector.getByTestId("chord-properties-inversion")).toHaveValue("6");
    await historyAction(page, "Redo");
    await expect(inspector.getByTestId("chord-properties-type-triad")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await steps.nth(1).click();
    await expect(inspector.locator(".chord-properties-function")).toHaveText("V");
    await expect(inspector.getByTestId("chord-properties-type-triad")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await steps.first().click();
    await expect(inspector.getByTestId("chord-properties-type-triad")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByTestId("progression-view-btn-tablature").click();
    await page.locator("[data-progression-step-select]").first().click();
    await expect(inspector).toBeVisible();
    await inspector.getByTestId("chord-properties-quality").selectOption("minor");
    await expect(inspector.getByTestId("chord-properties-quality")).toHaveValue("minor");

    await page.getByTestId("progression-view-btn-piano-roll").click();
    const pianoRollChord = page
      .locator(`[data-testid="piano-roll-chord"][data-source-step-id="${sourceStepId}"]`)
      .first();
    await expect(pianoRollChord).toBeVisible();
    await pianoRollChord.click();
    await expect(inspector).toBeVisible();
    await inspector.getByTestId("chord-properties-reset").click();
    await inspector.getByTestId("chord-properties-add-9").check();
    await expect(inspector.getByTestId("chord-properties-add-9")).toBeChecked();
    await expect(inspector).toContainText("Cadd9");
    await inspector.getByTestId("chord-properties-borrow").selectOption("dorian");
    await expect(inspector.locator(".chord-properties-function")).toContainText(
      "borrowed from Dorian",
    );
    await expect(inspector.locator(".chord-properties-function")).not.toContainText("mode-");
    await expect(pianoRollChord.getByTestId("step-function")).toContainText("borrowed from Dorian");
    await expect(pianoRollChord.getByTestId("step-function")).not.toContainText("mode-");
    await expect(inspector.getByTestId("chord-properties-secondary")).toBeDisabled();
    await inspector.getByTestId("chord-properties-borrow").selectOption("none");
    await expect(inspector.locator(".chord-properties-function")).toHaveText("I");
    await inspector.getByTestId("chord-properties-secondary").selectOption("dominant:ii");
    await expect(inspector.locator(".chord-properties-function")).toHaveText("V7/ii");
    await expect(inspector.getByTestId("chord-properties-borrow")).toBeDisabled();
    await inspector.getByTestId("chord-properties-secondary").selectOption("none");
    await expect(inspector.locator(".chord-properties-function")).toHaveText("I");
  });

  test("shows clear states for Rest and no selection", async ({ page }) => {
    await openStudio(page);
    const unavailable = page.locator(".chord-properties-unavailable");
    await expect(unavailable).toContainText("Select a chord Step");

    await addChord(page, "I");
    await page.getByTestId("progression-view-btn-staff").click();
    await addRestToProgression(page);
    await expect(page.locator("[data-progression-step-select]")).toHaveCount(2);
    await page.locator("[data-progression-step-select]").last().click();
    await expect(unavailable).toContainText("unavailable for a Rest");
    await expect(page.getByTestId("step-performance-inspector")).toBeVisible();
  });
});
