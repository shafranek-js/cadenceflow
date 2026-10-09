import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { setProgressionView } from "./test-helpers/progression-settings";

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, "print", {
      configurable: true,
      value: () => {
        document.documentElement.dataset.printCalled = "true";
      },
    });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
  await setProgressionView(page, "staff");
}

async function addChord(page: Page, functionId: string): Promise<void> {
  await page
    .getByTestId(`chord-card-${functionId}`)
    .locator(".chord-main")
    .click({ modifiers: ["Control"] });
}

test.describe("T195 — Printable A4 release gate", () => {
  test("keeps a long progression ordered and printable without clipping", async ({
    page,
    browserName,
  }, testInfo: TestInfo) => {
    test.skip(
      browserName !== "chromium",
      "Playwright page.pdf is supported only by headless Chromium",
    );
    await openStudio(page);
    for (const functionId of ["V7", "I", "vi", "IV", "V"] as const) {
      await addChord(page, functionId);
    }
    for (let index = 0; index < 15; index += 1) {
      await addChord(page, ["I", "vi", "IV", "V"][index % 4]!);
    }

    const stepIdsBefore = await page
      .locator(".measure-staff-event-select[data-step-id]")
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.stepId ?? ""));

    await page.getByTestId("print-progression").focus();
    await page.keyboard.press("Enter");
    await page.emulateMedia({ media: "print" });
    await expect(page.getByTestId("printable-progression")).toBeVisible();
    const pdfBytes = await page.pdf({
      path: testInfo.outputPath("t195-long-progression.pdf"),
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    const pdfPageCount = (pdfBytes.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;

    const evidence = await page.evaluate((pageCount) => {
      const printable = document.querySelector<HTMLElement>(
        "[data-testid='printable-progression']",
      );
      if (!printable) throw new Error("Printable progression is missing");
      const measures = Array.from(
        printable.querySelectorAll<HTMLElement>("[data-testid='printable-measure']"),
      );
      const projectMeta = printable.querySelector<HTMLElement>(".printable-project-meta");
      if (!projectMeta) throw new Error("Printable project metadata is missing");
      const projectMetaTextRight = Math.max(
        ...Array.from(projectMeta.children, (child) => child.getBoundingClientRect().right),
      );
      const projectMetaSafeRight =
        projectMeta.getBoundingClientRect().right -
        Number.parseFloat(getComputedStyle(projectMeta).paddingRight);
      return {
        printCalled: document.documentElement.dataset.printCalled === "true",
        measureCount: measures.length,
        chordCount: printable.querySelectorAll("[data-testid='printable-chord-step']").length,
        guitarCount: printable.querySelectorAll("[data-testid='printable-guitar-diagram']").length,
        directionArrows: printable.querySelectorAll(".printable-direction-arrow").length,
        scrollWidth: printable.scrollWidth,
        clientWidth: printable.clientWidth,
        measureWidths: measures.map((measure) => measure.getBoundingClientRect().width),
        breakInside: getComputedStyle(measures[0]!).breakInside,
        pageBreakInside: getComputedStyle(measures[0]!).pageBreakInside,
        textColor: getComputedStyle(
          printable.querySelector<HTMLElement>(".printable-chord-symbol")!,
        ).color,
        printSurfaceColors: [
          getComputedStyle(document.documentElement).backgroundColor,
          getComputedStyle(document.body).backgroundColor,
          getComputedStyle(document.querySelector<HTMLElement>("#root")!).backgroundColor,
          getComputedStyle(document.querySelector<HTMLElement>(".app-shell")!).backgroundColor,
        ],
        projectMetaPaddingRight: getComputedStyle(projectMeta).paddingRight,
        projectMetaTextRight,
        projectMetaSafeRight,
        pageCount,
      };
    }, pdfPageCount);

    expect(evidence.printCalled).toBe(true);
    expect(evidence.measureCount).toBe(20);
    expect(evidence.chordCount).toBe(20);
    expect(evidence.guitarCount).toBe(20);
    expect(evidence.directionArrows).toBeGreaterThan(0);
    expect(evidence.scrollWidth).toBeLessThanOrEqual(evidence.clientWidth);
    expect(evidence.measureWidths.every((width) => width <= evidence.clientWidth + 1)).toBe(true);
    expect(evidence.breakInside).toBe("avoid");
    expect(evidence.pageBreakInside).toBe("avoid");
    expect(evidence.textColor).toBe("rgb(17, 24, 39)");
    expect(evidence.printSurfaceColors).toEqual(Array(4).fill("rgb(255, 255, 255)"));
    expect(Number.parseFloat(evidence.projectMetaPaddingRight)).toBeGreaterThan(0);
    expect(evidence.projectMetaTextRight).toBeLessThanOrEqual(evidence.projectMetaSafeRight + 0.5);
    expect(evidence.pageCount).toBeGreaterThan(1);
    expect(
      await page
        .locator(".measure-staff-event-select[data-step-id]")
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.stepId ?? "")),
    ).toEqual(stepIdsBefore);
  });

  test("is keyboard discoverable in both supported desktop sizes and themes", async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      await openStudio(page);
      for (const theme of ["light", "dark"] as const) {
        if (theme === "light") {
          await page.getByRole("button", { name: "Light theme" }).click();
        } else {
          await page.getByRole("button", { name: "Dark theme" }).click();
        }
        const printButton = page.getByRole("button", { name: "Print / Save as PDF" });
        await expect(printButton).toBeVisible();
        await expect(printButton).toHaveAttribute(
          "title",
          "Open the system print dialog; choose Save as PDF to export",
        );
        await printButton.focus();
        await expect(printButton).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator("html")).toHaveAttribute("data-print-called", "true");
      }
    }
  });
});
