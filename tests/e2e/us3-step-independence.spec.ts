import { test, expect } from "@playwright/test";

test("US3 keeps repeated steps independent and requires explicit Replace Step", async ({
  page,
}) => {
  await page.goto("/");
  const tonic = page.getByTestId("chord-card-I");

  await tonic.locator(".chord-main").click();
  await page.getByLabel("Master Velocity").fill("92");
  await page.getByRole("button", { name: "Articulation: Arp Up" }).click();
  await expect(page.getByLabel(/Customized/)).toBeVisible();

  await tonic.locator(".chord-main").click({ modifiers: ["Control"] });
  await tonic.locator(".chord-main").click({ modifiers: ["Control"] });
  await expect(page.getByTestId("progression-step")).toHaveCount(2);

  const first = page.getByTestId("progression-step").nth(0);
  const second = page.getByTestId("progression-step").nth(1);
  await first.getByRole("button", { name: /Select progression step 1:/ }).click();
  const selectedInspector = page.getByTestId("step-performance-inspector");
  await selectedInspector.getByRole("button", { name: "MIDI velocity view" }).click();
  await selectedInspector.getByLabel("Master Velocity").fill("55");
  await expect(first).toContainText("v55");
  await expect(second).toContainText("v92");

  await tonic.locator(".chord-main").click();
  await page.getByRole("button", { name: "Reset Card to Defaults" }).click();
  await tonic.locator(".chord-main").click({ modifiers: ["Control"] });
  await expect(page.getByTestId("progression-step").nth(2)).toContainText("v80");
  await expect(first).toContainText("v55");
  await expect(second).toContainText("v92");

  await page.getByTestId("chord-card-V").locator(".chord-main").click();
  await expect(first).toContainText("I");
  await selectedInspector.getByRole("button", { name: "Replace Step" }).click();
  await expect(first).toContainText("V");

  await selectedInspector.getByRole("button", { name: "MIDI velocity view" }).click();
  await selectedInspector.getByLabel("Master Velocity").fill("121");
  await selectedInspector.getByRole("button", { name: "Reset Performance" }).click();
  await expect(first).toContainText("v80");
  await expect(first).toContainText("V");
});
