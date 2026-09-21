import { expect, test, type Page } from "@playwright/test";

async function waitForStudio(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "My Progression" })).toBeVisible();
  await expect(page.locator('.matrix-panel[data-module="progressions"]')).toBeVisible();
}

async function expectNoPageOverflow(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
}

async function expectProgressionsTopology(page: Page): Promise<void> {
  const panel = page.locator('.matrix-panel[data-module="progressions"]');
  await expect(panel).toHaveAttribute("data-topology-columns", "6");
  await expect(panel.locator("[data-layer]")).toHaveCount(3);
  await expect(panel.locator('[data-zone-label="Secondary Dominants"]')).toBeVisible();
  await expect(panel.locator('[data-zone-label="Main Chords"]')).toBeVisible();
  await expect(panel.locator('[data-zone-label="Modal Interchange"]')).toBeVisible();

  const geometry = await panel.evaluate((element) => {
    const card = (id: string) =>
      element.querySelector<HTMLElement>(`[data-testid="chord-card-${id}"]`);
    const rect = (id: string) => card(id)?.getBoundingClientRect();
    const source = rect("V7");
    const target = rect("I");
    const alignedPairs = [
      ["V7", "I"],
      ["V7/vi", "vi"],
      ["V7/IV", "IV"],
      ["V7/ii", "ii"],
      ["V7/V", "V"],
      ["V7/iii", "iii"],
    ].map(([sourceId, targetId]) => {
      const sourceRect = rect(sourceId);
      const targetRect = rect(targetId);
      return Math.abs((sourceRect?.left ?? 0) - (targetRect?.left ?? 0)) <= 1;
    });
    return {
      sourceColumn: card("V7")?.dataset.matrixColumn,
      targetColumn: card("I")?.dataset.matrixColumn,
      targetId: card("V7")?.dataset.targetId,
      sourceMixPolicy: card("V7")?.dataset.mixPolicy,
      sourceTop: source?.top,
      targetTop: target?.top,
      sourceLeft: source?.left,
      targetLeft: target?.left,
      alignedPairs,
      sourceWidth: source?.width,
      sourceHeight: source?.height,
      auxiliaryIds: Array.from(
        element.querySelectorAll<HTMLElement>("[data-matrix-auxiliary='true']"),
      ).map((item) => item.dataset.testid),
      sidecar: element.querySelector<HTMLElement>("[data-testid='matrix-sidecar-subV7']"),
      sidecarRect: element
        .querySelector<HTMLElement>("[data-testid='matrix-sidecar-subV7']")
        ?.getBoundingClientRect(),
      subV7Rect: element
        .querySelector<HTMLElement>("[data-testid='chord-card-subV7']")
        ?.getBoundingClientRect(),
      hasDisclosure: Boolean(element.querySelector("details, summary")),
      hasExpandedOrAuxiliaryStrip: Boolean(
        element.querySelector(".matrix-expanded-strip, .matrix-auxiliary-strip"),
      ),
      hasAdditionalLabel: Boolean(element.querySelector(".auxiliary-label")),
      hasNoRecommendationNotice: Boolean(
        element.querySelector("[data-testid='matrix-no-recommendation']"),
      ),
      cardsByZone: Array.from(element.querySelectorAll<HTMLElement>("[data-layer]"), (layer) => ({
        label: layer.dataset.zoneLabel,
        cards: layer.querySelectorAll(".matrix-layer-cards > .chord-card").length,
      })),
    };
  });

  expect(geometry.sourceColumn).toBe(geometry.targetColumn);
  expect(geometry.targetId).toBe("I");
  expect(geometry.sourceMixPolicy).toBe("must-resolve");
  expect(geometry.sourceTop).toBeLessThan(geometry.targetTop ?? Number.POSITIVE_INFINITY);
  expect(Math.abs((geometry.sourceLeft ?? 0) - (geometry.targetLeft ?? 0))).toBeLessThanOrEqual(1);
  expect(geometry.alignedPairs).toEqual([true, true, true, true, true, true]);
  expect(geometry.auxiliaryIds).toEqual(["chord-card-subV7"]);
  expect(geometry.sidecar).not.toBeNull();
  expect(geometry.sidecarRect?.top).toBe(geometry.sourceTop);
  expect(geometry.sidecarRect?.left).toBeGreaterThanOrEqual(
    (geometry.sourceLeft ?? 0) + (geometry.sourceWidth ?? 0) * 6 - 1,
  );
  expect(geometry.sidecarRect?.height).toBeCloseTo(geometry.sourceHeight ?? 0, 4);
  expect(geometry.sidecarRect?.height).toBeCloseTo(geometry.subV7Rect?.height ?? 0, 4);
  expect(geometry.subV7Rect?.top).toBe(geometry.sidecarRect?.top);
  expect(geometry.subV7Rect?.height).toBeCloseTo(geometry.sourceHeight ?? 0, 4);
  expect(geometry.hasDisclosure).toBe(false);
  expect(geometry.hasExpandedOrAuxiliaryStrip).toBe(false);
  expect(geometry.hasAdditionalLabel).toBe(false);
  expect(geometry.hasNoRecommendationNotice).toBe(false);
  expect(geometry.cardsByZone).toEqual([
    { label: "Secondary Dominants", cards: 6 },
    { label: "Main Chords", cards: 7 },
    { label: "Modal Interchange", cards: 4 },
  ]);
}

async function expectProgressionsCardViewGeometry(
  page: Page,
  allowMainTrackOverflow = false,
): Promise<void> {
  const panel = page.locator('.matrix-panel[data-module="progressions"]');
  const evidence = await panel.evaluate((element) =>
    Array.from(element.querySelectorAll<HTMLElement>("[data-layer]"), (layer) => {
      const cards = Array.from(
        layer.querySelectorAll<HTMLElement>(".matrix-layer-cards > .chord-card"),
      );
      const tops = cards.map((card) => Math.round(card.getBoundingClientRect().top));
      return {
        label: layer.dataset.zoneLabel,
        count: cards.length,
        rowSpan: Math.max(...tops) - Math.min(...tops),
        trackOverflow:
          layer.querySelector<HTMLElement>(".matrix-layer-cards")!.scrollWidth >
          layer.querySelector<HTMLElement>(".matrix-layer-cards")!.clientWidth,
      };
    }),
  );

  expect(evidence).toHaveLength(3);
  expect(evidence[0]).toMatchObject({ label: "Secondary Dominants", count: 6, rowSpan: 0 });
  expect(evidence[1]).toMatchObject({ label: "Main Chords", count: 7, rowSpan: 0 });
  expect(evidence[2]).toEqual({
    label: "Modal Interchange",
    count: 4,
    rowSpan: 0,
    trackOverflow: false,
  });
  if (!allowMainTrackOverflow) {
    expect(evidence[0]?.trackOverflow).toBe(false);
    expect(evidence[1]?.trackOverflow).toBe(false);
  }
  await expect(panel.locator(".matrix-auxiliary-strip")).toHaveCount(0);
  await expect(panel.getByTestId("chord-card-vii°")).toBeVisible();
  await expect(panel.getByTestId("matrix-sidecar-subV7")).toBeVisible();
  await expect(panel.getByTestId("chord-card-subV7")).toBeVisible();
  await expect(panel.getByRole("group", { name: "Tritone substitution" })).toBeVisible();
  await expect(
    panel.getByRole("button", { name: /Tritone substitute resolving to I/ }),
  ).toBeVisible();
  await expect(panel.locator("details, summary")).toHaveCount(0);
}

test.describe("T190 Matrix spatial topology", () => {
  test("keeps Progressions aligned and interactive at desktop size", async ({ page }) => {
    await waitForStudio(page, 1280, 720);
    await expectProgressionsTopology(page);
    await expectNoPageOverflow(page);

    const panel = page.locator('.matrix-panel[data-module="progressions"]');
    await expect(page.getByRole("group", { name: "Tritone substitution" })).toBeVisible();
    await expect(panel.locator("details, summary")).toHaveCount(0);

    const matrixHeightBeforeNoRecommendation = (await panel.boundingBox())?.height;
    await panel.locator('[data-testid="chord-card-subV7"] .chord-main').click();
    await expect(panel.getByTestId("chord-card-I")).toHaveAttribute("data-recommendation", "best");
    await expect(page.getByTestId("matrix-recommendation-status")).toHaveCount(0);
    await expect(panel.getByTestId("matrix-no-recommendation")).toHaveCount(0);
    expect((await panel.boundingBox())?.height).toBe(matrixHeightBeforeNoRecommendation);

    const iCard = page.locator('[data-testid="chord-card-I"]');
    const iButton = iCard.locator(".chord-main");
    await iButton.focus();
    await page.keyboard.press("Enter");
    await expect(iCard).toHaveClass(/is-selected/);

    await page
      .locator('[data-testid="chord-card-V7"] .chord-main')
      .click({ modifiers: ["Control"] });
    await expect(page.locator('[data-testid="progression-step"]')).toHaveCount(1);

    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByTestId("transport-status")).toContainText("Playing", {
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(page.getByTestId("transport-status")).toContainText("Stopped");
  });

  test("keeps the same coordinate contract at a wide viewport and across themes", async ({
    page,
  }) => {
    await waitForStudio(page, 1920, 1080);
    await expectProgressionsTopology(page);
    await expectNoPageOverflow(page);

    await page.getByRole("button", { name: "Light theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expectProgressionsTopology(page);
    await expectNoPageOverflow(page);

    await page.getByRole("button", { name: "Dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectProgressionsTopology(page);
    await expectNoPageOverflow(page);
  });

  test("keeps every Progressions card view compact in light, dark, and pressure layouts", async ({
    page,
  }) => {
    const views = ["harmonic", "piano", "staff", "guitar"] as const;
    for (const [width, height] of [
      [1920, 1080],
      [1280, 720],
      [640, 360],
    ] as const) {
      await waitForStudio(page, width, height);
      for (const theme of ["dark", "light"] as const) {
        if (theme === "light") {
          await page.getByRole("button", { name: "Light theme" }).click();
        } else {
          await page.getByRole("button", { name: "Dark theme" }).click();
        }
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        for (const view of views) {
          await page.getByLabel("Global Card View").selectOption(view);
          await expectProgressionsCardViewGeometry(page, width <= 1280);
          await expectNoPageOverflow(page);
        }
      }
    }
  });

  test("keeps Dark Harmony poles aligned and contains the six-column board at 200% equivalent", async ({
    page,
  }) => {
    await waitForStudio(page, 640, 360);
    await page.getByRole("button", { name: "Dark Harmony" }).click();

    const panel = page.locator('.matrix-panel[data-module="dark-harmony"]');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-topology-columns", "6");
    await expect(panel.locator('[data-zone-label="Secondary Diminished"]')).toBeVisible();
    await expect(panel.locator('[data-zone-label="Main Chords"]')).toBeVisible();
    await expect(panel.locator('[data-zone-label="Neapolitan / Chromatic Colors"]')).toBeVisible();

    const geometry = await panel.evaluate((element) => {
      const card = (id: string) =>
        element.querySelector<HTMLElement>(`[data-testid="chord-card-${id}"]`);
      const rect = (id: string) => card(id)?.getBoundingClientRect();
      const diminished = rect("vii°7/V");
      const dominant = rect("V");
      return {
        diminishedColumn: card("vii°7/V")?.dataset.matrixColumn,
        dominantColumn: card("V")?.dataset.matrixColumn,
        diminishedTarget: card("vii°7/V")?.dataset.targetId,
        diminishedTop: diminished?.top,
        dominantTop: dominant?.top,
        n6Column: card("N6")?.dataset.matrixColumn,
        n6BassScaleDegree: card("N6")?.dataset.bassScaleDegree,
        internalBoardOverflow:
          element.querySelector<HTMLElement>(".matrix-spatial-board")!.scrollWidth >
          element.querySelector<HTMLElement>(".matrix-spatial-board")!.clientWidth,
      };
    });

    expect(geometry.diminishedColumn).toBe(geometry.dominantColumn);
    expect(geometry.diminishedTarget).toBe("V");
    expect(geometry.diminishedTop).toBeLessThan(geometry.dominantTop ?? Number.POSITIVE_INFINITY);
    expect(geometry.n6Column).toBe(geometry.dominantColumn);
    expect(geometry.n6BassScaleDegree).toBe("4");
    expect(geometry.internalBoardOverflow).toBe(true);

    const n6Card = panel.locator('[data-testid="chord-card-N6"]');
    await expect(panel.getByTestId("chord-card-vii°")).toBeVisible();
    await expect(panel.locator(".matrix-expanded-strip, .matrix-auxiliary-strip")).toHaveCount(0);
    await expect(n6Card).toHaveAttribute("data-bass-scale-degree", "4");
    const viewLabels = {
      harmonic: ".chord-card-identity",
      piano: ".mini-piano-chord-name",
      staff: ".mini-staff-chord-name",
      guitar: ".mini-guitar-chord-name",
    } as const;
    for (const [view, labelSelector] of Object.entries(viewLabels)) {
      await page.getByLabel("Global Card View").selectOption(view);
      await expect(n6Card.locator(labelSelector)).toContainText("/");
    }
    await expectNoPageOverflow(page);
  });

  test("keeps contextual Dark Harmony diminished cards in the target band", async ({ page }) => {
    await waitForStudio(page, 1280, 720);
    await page.getByRole("button", { name: "Dark Harmony" }).click();
    await page.getByLabel("Global Card View").selectOption("harmonic");

    const panel = page.locator('.matrix-panel[data-module="dark-harmony"]');
    const baselineGeometry = await panel.evaluate((element) =>
      ["vii°7/iv", "vii°7/V", "vii°7/VI"].map((id) => {
        const card = element.querySelector<HTMLElement>(`[data-testid="chord-card-${id}"]`)!;
        const rect = card.getBoundingClientRect();
        return { id, column: card.dataset.matrixColumn, center: rect.left + rect.width / 2 };
      }),
    );

    await panel.getByTestId("chord-card-vii°").locator(".chord-main").click();
    const contextual = panel.getByTestId("chord-card-vii°7/i");
    await expect(contextual).toBeVisible();
    await expect(contextual).toHaveAttribute("data-matrix-contextual", "true");
    await expect(contextual.getByText("Contextual", { exact: true })).toBeVisible();
    await expect(
      contextual.getByRole("button", { name: /Contextual diminished resolving to i/ }),
    ).toBeVisible();

    const contextualGeometry = await panel.evaluate((element) => {
      const contextualCard = element.querySelector<HTMLElement>(
        '[data-testid="chord-card-vii°7/i"]',
      )!;
      const targetCard = element.querySelector<HTMLElement>('[data-testid="chord-card-i"]')!;
      const contextualRect = contextualCard.getBoundingClientRect();
      const targetRect = targetCard.getBoundingClientRect();
      return {
        contextualColumn: contextualCard.dataset.matrixColumn,
        contextualCenter: contextualRect.left + contextualRect.width / 2,
        targetCenter: targetRect.left + targetRect.width / 2,
        contextualTop: contextualRect.top,
        targetTop: targetRect.top,
        rowCount: element.querySelectorAll(".matrix-layer-cards > .chord-card").length,
        hasStrips: Boolean(
          element.querySelector(".matrix-expanded-strip, .matrix-auxiliary-strip"),
        ),
        hasDisclosure: Boolean(element.querySelector("details, summary")),
      };
    });

    expect(contextualGeometry.contextualColumn).toBe("0");
    expect(
      Math.abs(contextualGeometry.contextualCenter - contextualGeometry.targetCenter),
    ).toBeLessThanOrEqual(1);
    expect(contextualGeometry.contextualTop).toBeLessThan(contextualGeometry.targetTop);
    expect(contextualGeometry.rowCount).toBeGreaterThanOrEqual(4);
    expect(contextualGeometry.hasStrips).toBe(false);
    expect(contextualGeometry.hasDisclosure).toBe(false);

    const afterGeometry = await panel.evaluate((element) =>
      ["vii°7/iv", "vii°7/V", "vii°7/VI"].map((id) => {
        const card = element.querySelector<HTMLElement>(`[data-testid="chord-card-${id}"]`)!;
        const rect = card.getBoundingClientRect();
        return { id, column: card.dataset.matrixColumn, center: rect.left + rect.width / 2 };
      }),
    );
    expect(afterGeometry).toEqual(baselineGeometry);
    await expectNoPageOverflow(page);
  });
});
