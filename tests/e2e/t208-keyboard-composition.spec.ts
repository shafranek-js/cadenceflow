import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { decodePortableProject } from "../../src/persistence/portableProject";

async function openMelodyMenu(page: import("@playwright/test").Page) {
  await page
    .locator("[data-progression-step-select], .piano-roll-chord")
    .first()
    .click({ button: "right" });
  return page.getByRole("menu", { name: /Melody actions/ });
}

async function runEditAction(page: import("@playwright/test").Page, action: "Undo" | "Redo") {
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) })
    .click();
}

test("T208 composes with keyboard in the authored draft and commits one undoable Apply", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("progression-view-btn-tablature").click();
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
  await page
    .getByTestId("chord-card-I")
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });

  const melodyMenu = await openMelodyMenu(page);
  await melodyMenu.getByRole("menuitem", { name: "Create Melody…" }).click();
  let dialog = page.getByRole("dialog", { name: "Create Melody" });
  await dialog.getByRole("button", { name: "Authored notes" }).click();
  await dialog.getByLabel("Authored pitch MIDI").fill("60");
  await dialog.getByLabel("Authored onset numerator").fill("0");
  await dialog.getByLabel("Authored duration numerator").fill("1");
  await dialog.getByRole("button", { name: "Add note" }).click();
  await dialog.getByLabel("Authored pitch MIDI").fill("62");
  await dialog.getByLabel("Authored onset numerator").fill("1");
  await dialog.getByRole("button", { name: "Add note" }).click();
  await dialog.getByRole("button", { name: "Apply Melody" }).click();
  await expect(dialog).toHaveCount(0);

  for (const view of ["tablature", "staff"] as const) {
    await page.getByTestId(`progression-view-btn-${view}`).click();
    const viewMenu = await openMelodyMenu(page);
    await viewMenu.getByRole("menuitem", { name: "Edit Melody…" }).click();
    const viewDialog = page.getByRole("dialog", { name: "Edit Melody" });
    await expect(viewDialog).toBeVisible();
    await viewDialog.getByRole("button", { name: "Close melody dialog" }).focus();
    await page.keyboard.press("Escape");
    await expect(viewDialog).toHaveCount(0);
    await expect(viewMenu).toHaveCount(0);
  }

  await page.getByTestId("progression-view-btn-piano-roll").click();
  const editMenu = await openMelodyMenu(page);
  await editMenu.getByRole("menuitem", { name: "Edit Melody…" }).click();
  dialog = page.getByRole("dialog", { name: "Edit Melody" });
  await expect(dialog.getByRole("button", { name: "Authored notes" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await dialog.getByRole("button", { name: "Authored notes" }).click();
  await expect(dialog.getByTestId("melody-editor-apply")).toHaveAttribute("type", "button");
  const list = dialog.getByTestId("authored-note-list");
  const first = dialog.locator("[data-authored-note-id]").nth(0);
  const second = dialog.locator("[data-authored-note-id]").nth(1);
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(dialog.locator('[data-authored-note-id][aria-pressed="true"]')).toHaveCount(2);
  await list.focus();
  await page.keyboard.press("ArrowUp");
  await expect(dialog.locator("[data-authored-note-id]")).toHaveCount(2);
  await page.keyboard.press("3");
  await page.keyboard.press("Control+z");
  await expect(dialog.locator("[data-authored-note-id]")).toHaveCount(2);

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  const pitchInput = dialog.getByLabel("Authored pitch MIDI");
  await expect(pitchInput).toBeFocused();
  await page.keyboard.press("Delete");
  await expect(dialog.locator("[data-authored-note-id]")).toHaveCount(2);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(page.locator("button.piano-roll-note, button.melody-staff-note")).toHaveCount(2);

  await dialog.getByRole("button", { name: "Apply Melody" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.locator("button.piano-roll-note, button.melody-staff-note").first(),
  ).toHaveAttribute("aria-label", /E4/);
  await runEditAction(page, "Undo");
  await expect(
    page.locator("button.piano-roll-note, button.melody-staff-note").first(),
  ).toHaveAttribute("aria-label", /C4/);
  await runEditAction(page, "Redo");
  await expect(
    page.locator("button.piano-roll-note, button.melody-staff-note").first(),
  ).toHaveAttribute("aria-label", /E4/);

  const insertionMenu = await openMelodyMenu(page);
  await insertionMenu.getByRole("menuitem", { name: "Edit Melody…" }).click();
  dialog = page.getByRole("dialog", { name: "Edit Melody" });
  await dialog.getByRole("button", { name: "Authored notes" }).click();
  await dialog.getByLabel("Authored pitch MIDI").fill("65");
  await dialog.getByLabel("Authored onset numerator").fill("3");
  await dialog.getByLabel("Authored onset denominator").fill("2");
  await dialog.getByLabel("Authored duration numerator").fill("3");
  await dialog.getByLabel("Authored duration denominator").fill("8");
  await dialog.getByTestId("authored-note-list").focus();
  await page.keyboard.press("Enter");
  await expect(
    dialog.getByRole("button", { name: /Edit MIDI 65, onset 3\/2, duration 3\/8/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("button.piano-roll-note, button.melody-staff-note")).toHaveCount(2);

  const deleteDraftMenu = await openMelodyMenu(page);
  await deleteDraftMenu.getByRole("menuitem", { name: "Edit Melody…" }).click();
  dialog = page.getByRole("dialog", { name: "Edit Melody" });
  await dialog.getByRole("button", { name: "Authored notes" }).click();
  await dialog.locator("[data-authored-note-id]").first().click();
  await page.keyboard.press("Delete");
  await expect(dialog.locator("[data-authored-note-id]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("button.piano-roll-note, button.melody-staff-note")).toHaveCount(2);

  const applyInsertionMenu = await openMelodyMenu(page);
  await applyInsertionMenu.getByRole("menuitem", { name: "Edit Melody…" }).click();
  dialog = page.getByRole("dialog", { name: "Edit Melody" });
  await dialog.getByRole("button", { name: "Authored notes" }).click();
  await dialog.getByLabel("Authored pitch MIDI").fill("65");
  await dialog.getByLabel("Authored onset numerator").fill("3");
  await dialog.getByLabel("Authored onset denominator").fill("2");
  await dialog.getByLabel("Authored duration numerator").fill("3");
  await dialog.getByLabel("Authored duration denominator").fill("8");
  await dialog.getByTestId("authored-note-list").focus();
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", { name: "Apply Melody" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-menu-toggle").click();
  await page.getByTestId("project-export-btn").click();
  const path = await (await downloadPromise).path();
  if (!path) throw new Error("Missing portable Project export");
  const exported = decodePortableProject(await readFile(path, "utf8"));
  const firstStep = exported.progression.steps[0];
  if (firstStep?.kind !== "chord" || firstStep.melody?.mode !== "authored")
    throw new Error("Expected authored Melody");
  const inserted = firstStep.melody.phrase.notes.find((note) => note.pitch.midiNumber === 65);
  expect(inserted?.onset).toEqual({ numerator: 3, denominator: 2 });
  expect(inserted?.duration).toEqual({ numerator: 3, denominator: 8 });
  await runEditAction(page, "Undo");
  await expect(page.locator("button.piano-roll-note, button.melody-staff-note")).toHaveCount(2);
  await runEditAction(page, "Redo");
  await expect(page.locator("button.piano-roll-note, button.melody-staff-note")).toHaveCount(3);

  for (const theme of ["Dark theme", "Light theme"] as const) {
    await page.getByRole("button", { name: theme }).click();
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
      { width: 640, height: 360 },
    ]) {
      await page.setViewportSize(viewport);
      const layoutMenu = await openMelodyMenu(page);
      await layoutMenu.getByRole("menuitem", { name: "Edit Melody…" }).click();
      dialog = page.getByRole("dialog", { name: "Edit Melody" });
      await expect(dialog.getByTestId("melody-editor-apply")).toBeVisible();
      const bounds = await dialog.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      await dialog.getByRole("button", { name: "Close melody dialog" }).focus();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    }
  }
});
