import { test, expect } from "@playwright/test";
import { setProgressionView } from "./test-helpers/progression-settings";

test("US3 keeps repeated steps independent and requires explicit Replace Step", async ({
  page,
}) => {
  await page.goto("/");
  await setProgressionView(page, "staff");
  const tonic = page.getByTestId("chord-card-I");

  await tonic.locator(".chord-main").click();
  await page.getByLabel("Master Velocity", { exact: true }).fill("92");
  await page.getByRole("button", { name: "Articulation: Arp Up" }).click();
  await expect(page.getByLabel(/Customized/)).toBeVisible();

  await tonic.locator(".chord-main").click({ modifiers: ["Control"] });
  await tonic.locator(".chord-main").click({ modifiers: ["Control"] });
  await expect(page.locator(".measure-staff-event-select")).toHaveCount(2);

  const steps = page.locator(".measure-staff-event-select");
  const first = steps.nth(0);
  const second = steps.nth(1);
  await first.click();
  const selectedInspector = page.getByTestId("step-performance-inspector");
  await selectedInspector.getByRole("button", { name: "MIDI velocity view" }).click();
  await selectedInspector.getByLabel("Master Velocity", { exact: true }).fill("55");
  await second.click();
  await selectedInspector.getByRole("button", { name: "MIDI velocity view" }).click();
  await expect(selectedInspector.getByLabel("Master Velocity", { exact: true })).toHaveValue("92");

  await tonic.locator(".chord-main").click();
  await page.getByRole("button", { name: "Reset Card to Defaults" }).click();
  await tonic.locator(".chord-main").click({ modifiers: ["Control"] });
  const third = steps.nth(2);
  await third.click();
  await selectedInspector.getByRole("button", { name: "MIDI velocity view" }).click();
  await expect(selectedInspector.getByLabel("Master Velocity", { exact: true })).toHaveValue("80");
  await first.click();
  await expect(selectedInspector.getByLabel("Master Velocity", { exact: true })).toHaveValue("55");
  await second.click();
  await expect(selectedInspector.getByLabel("Master Velocity", { exact: true })).toHaveValue("92");

  await page.getByTestId("chord-card-V").locator(".chord-main").click();
  await first.click();
  await expect(first).toHaveAttribute("aria-label", /Select I ·/);
  await selectedInspector.getByRole("button", { name: "Replace Step" }).click();
  await expect(first).toHaveAttribute("aria-label", /Select V ·/);

  await selectedInspector.getByRole("button", { name: "MIDI velocity view" }).click();
  await selectedInspector.getByLabel("Master Velocity", { exact: true }).fill("121");
  await selectedInspector.getByRole("button", { name: "Reset Performance" }).click();
  await expect(first).toHaveAttribute("aria-label", /Select V ·/);
  await selectedInspector.getByRole("button", { name: "MIDI velocity view" }).click();
  await expect(selectedInspector.getByLabel("Master Velocity", { exact: true })).toHaveValue("80");
});
