import { expect, test } from "@playwright/test";

async function runEditAction(page: import("@playwright/test").Page, action: "Undo" | "Redo") {
  await page.getByTestId("edit-menu-toggle").click();
  await page
    .getByRole("menu", { name: "Edit menu" })
    .getByRole("menuitem", { name: new RegExp(action) })
    .click();
}

test("T207 authored notes create, persist, edit, undo, redo, and delete", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
  await page
    .getByTestId("chord-card-I")
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
  await page
    .getByTestId("progression-step")
    .first()
    .locator("[data-progression-step-select]")
    .click({ button: "right" });
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

  let note = page.getByTestId("melody-lane-note").first();
  await expect(note).toHaveAttribute("data-start-beats", "0/1");
  await expect(note).toHaveAttribute("data-duration-beats", "3/2");
  const stableNoteId = await note.getAttribute("data-melody-event-key");
  await page.waitForTimeout(750);
  await page.reload({ waitUntil: "domcontentloaded" });
  note = page.getByTestId("melody-lane-note").first();
  await expect(note).toHaveAttribute("data-melody-event-key", stableNoteId!);
  await expect(note).toHaveAttribute("data-duration-beats", "3/2");

  await note.click();
  await note.focus();
  await page.keyboard.press("Enter");
  await note.dblclick();
  dialog = page.getByRole("dialog", { name: "Edit Melody" });
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
  await expect(page.getByTestId("melody-lane-note").first()).toContainText("G#4");

  await runEditAction(page, "Undo");
  await expect(page.getByTestId("melody-lane-note").first()).toContainText("G4");
  await runEditAction(page, "Redo");
  await expect(page.getByTestId("melody-lane-note").first()).toContainText("G#4");

  await page.getByTestId("melody-lane-note").first().dblclick();
  dialog = page.getByRole("dialog", { name: "Edit Melody" });
  await dialog.getByRole("button", { name: /Edit MIDI 68/ }).click();
  await dialog.getByRole("button", { name: /^Delete authored note/ }).click();
  await dialog.getByRole("button", { name: "Apply Melody" }).click();
  await expect(page.getByTestId("melody-lane-note")).toHaveCount(0);
  await runEditAction(page, "Undo");
  await expect(page.getByTestId("melody-lane-note")).toHaveCount(1);
});
