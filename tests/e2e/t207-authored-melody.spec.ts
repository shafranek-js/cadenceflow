import { expect, test } from "@playwright/test";
import { setProgressionView } from "./test-helpers/progression-settings";
async function runEditAction(page: import("@playwright/test").Page, action: "Undo" | "Redo") {
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) })
    .click();
}

async function openEditMelodyDialog(page: import("@playwright/test").Page) {
  await page.locator(".measure-staff-event-select").first().click({ button: "right" });
  await page
    .getByRole("menu", { name: /Melody actions/ })
    .getByRole("menuitem", { name: "Edit Melody…" })
    .click();
  return page.getByRole("dialog", { name: "Edit Melody" });
}

test("T207 authored notes create, persist, edit, undo, redo, and delete", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
  await page
    .getByTestId("chord-card-I")
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
  await setProgressionView(page, "staff");
  await page.locator(".measure-staff-event-select").first().click({ button: "right" });
  const menu = page.getByRole("menu", { name: /Melody actions/ });
  await menu.getByRole("menuitem", { name: "Create Melody…" }).click();
  let dialog = page.getByRole("dialog", { name: "Create Melody" });
  await dialog.getByRole("button", { name: "Authored notes" }).click();
  await dialog.getByLabel("Authored pitch MIDI").fill("67");
  await dialog.getByLabel("Authored onset numerator").fill("0");
  await dialog.getByLabel("Authored onset denominator").fill("1");
  await dialog.getByLabel("Authored duration numerator").fill("3");
  await dialog.getByLabel("Authored duration denominator").fill("2");
  await dialog.getByRole("button", { name: "Add note" }).click();
  await dialog.getByRole("button", { name: "Apply Melody" }).click();
  await expect(dialog).toHaveCount(0);
  let note = page.locator(".melody-staff-note").first();
  await expect(note).toHaveAttribute("aria-label", /G4, onset 0\/1 beats, duration 3\/2 beats/);
  const stableNoteId = await note.getAttribute("data-melody-event-key");
  await page.waitForTimeout(750);
  await page.reload({ waitUntil: "domcontentloaded" });
  note = page.locator(".melody-staff-note").first();
  await expect(note).toHaveAttribute("data-melody-event-key", stableNoteId!);
  await expect(note).toHaveAttribute("aria-label", /duration 3\/2 beats/);

  await note.click();
  await note.focus();
  await page.keyboard.press("Enter");
  dialog = await openEditMelodyDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Authored notes" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(dialog.getByTestId("authored-melody-editor")).toBeVisible();
  await dialog.getByRole("button", { name: /Edit MIDI 67/ }).click();
  await dialog.getByLabel("Authored pitch MIDI").fill("68");
  await dialog.getByRole("button", { name: "Update note" }).click();
  await dialog.getByRole("button", { name: "Apply Melody" }).click();
  await expect(page.locator(".melody-staff-note").first()).toHaveAttribute("aria-label", /G#4/);

  await runEditAction(page, "Undo");
  await expect(page.locator(".melody-staff-note").first()).toHaveAttribute("aria-label", /G4/);
  await runEditAction(page, "Redo");
  await expect(page.locator(".melody-staff-note").first()).toHaveAttribute("aria-label", /G#4/);

  dialog = await openEditMelodyDialog(page);
  await dialog.getByRole("button", { name: /Edit MIDI 68/ }).click();
  await dialog.getByRole("button", { name: /^Delete authored note/ }).click();
  await dialog.getByRole("button", { name: "Apply Melody" }).click();
  await expect(page.locator(".melody-staff-note")).toHaveCount(0);
  await runEditAction(page, "Undo");
  await expect(page.locator(".melody-staff-note")).toHaveCount(1);
});
