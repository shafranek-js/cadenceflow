import { test, expect } from "@playwright/test";

test("US3 keeps repeated steps independent and requires explicit Replace Step", async ({
  page,
}) => {
  await page.goto("/");
  const tonic = page.getByTestId("chord-card-I");

  await tonic.getByRole("button", { name: "Settings for I" }).click();
  await page.getByLabel("Master Velocity").fill("92");
  await page.getByLabel("Articulation").selectOption("arp-up");
  await expect(page.getByLabel(/Customized/)).toBeVisible();

  await tonic.getByRole("button", { name: /Add I to progression/i }).click();
  await tonic.getByRole("button", { name: /Add I to progression/i }).click();
  await expect(page.getByTestId("progression-step")).toHaveCount(2);

  const first = page.getByTestId("progression-step").nth(0);
  const second = page.getByTestId("progression-step").nth(1);
  await first.click();
  await first.getByLabel("Velocity").fill("55");
  await expect(first).toContainText("v55");
  await expect(second).toContainText("v92");

  await tonic.getByRole("button", { name: "Settings for I" }).click({ modifiers: ["Control"] });
  await tonic.getByRole("button", { name: /Add I to progression/i }).click();
  await expect(page.getByTestId("progression-step").nth(2)).toContainText("v80");
  await expect(first).toContainText("v55");
  await expect(second).toContainText("v92");

  await page.getByTestId("chord-card-V").locator(".chord-main").click();
  await expect(first).toContainText("I");
  await first.getByRole("button", { name: "Replace Step" }).click();
  await expect(first).toContainText("V");

  await first.getByLabel("Velocity").fill("121");
  await first.getByRole("button", { name: "Reset Performance" }).click();
  await expect(first).toContainText("v80");
  await expect(first).toContainText("V");
});
