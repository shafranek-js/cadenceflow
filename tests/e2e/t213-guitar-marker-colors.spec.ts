import { writeFile } from "node:fs/promises";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const viewports = [
  { width: 640, height: 360 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
] as const;

type Theme = "light" | "dark";
type Orientation = "vertical" | "horizontal";
type ColorMode = "chord-roles" | "fingering";

async function openViewMenu(page: Page) {
  await page.getByTestId("view-menu-toggle").click();
  return page.getByRole("menu", { name: "View menu" });
}

async function chooseViewItem(page: Page, testId: string) {
  const menu = await openViewMenu(page);
  await menu.getByTestId(testId).click();
}

async function chooseColorModeByKeyboard(page: Page, mode: ColorMode) {
  const menu = await openViewMenu(page);
  await menu.getByTestId(`guitar-chord-color-mode-${mode}`).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("view-menu-toggle")).toBeFocused();
  const selectedMenu = await openViewMenu(page);
  await expect(selectedMenu.getByTestId(`guitar-chord-color-mode-${mode}`)).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("view-menu-toggle")).toBeFocused();
}

async function captureCard(card: Locator, testInfo: TestInfo, filename: string) {
  await card.screenshot({ path: testInfo.outputPath(filename), animations: "disabled" });
}

async function centerCardInViewport(card: Locator) {
  await card.evaluate((element) => {
    const scroller = element.closest<HTMLElement>(".studio-grid");
    if (!scroller) throw new Error("The card is outside the Studio scroll region");
    const scrollport = scroller.getBoundingClientRect();
    const targetTop = Math.ceil(scrollport.top + scroller.clientTop + 1);
    const currentTop = element.getBoundingClientRect().top;
    scroller.scrollBy({ top: currentTop - targetTop, behavior: "instant" });
  });
}

async function revealBelowStickyHeader(target: Locator) {
  await target.evaluate((element) => {
    element.scrollIntoView({ behavior: "instant", block: "center", inline: "nearest" });
    const scroller = element.closest<HTMLElement>(".studio-grid");
    if (!scroller) throw new Error("The target is outside the Studio scroll region");
    const scrollport = scroller.getBoundingClientRect();
    const visibleTop = Math.ceil(scrollport.top + scroller.clientTop + 12);
    const visibleBottom = scrollport.top + scroller.clientTop + scroller.clientHeight - 8;
    const rect = element.getBoundingClientRect();
    const delta =
      rect.top < visibleTop
        ? rect.top - visibleTop
        : rect.bottom > visibleBottom
          ? rect.bottom - visibleBottom
          : 0;
    if (delta !== 0) scroller.scrollBy({ top: delta, behavior: "instant" });
  });
}

async function measureVisibleBounds(target: Locator) {
  return target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const headerBottom = document.querySelector(".app-header")?.getBoundingClientRect().bottom ?? 0;
    const visible = {
      left: 0,
      top: Math.ceil(headerBottom + 8),
      right: window.innerWidth,
      bottom: window.innerHeight - 8,
    };
    const clippingAncestors: Array<{
      tag: string;
      className: string;
      overflowX: string;
      overflowY: string;
      left: number;
      top: number;
      right: number;
      bottom: number;
    }> = [];

    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const clipsX = style.overflowX !== "visible";
      const clipsY = style.overflowY !== "visible";
      if (!clipsX && !clipsY) continue;
      const ancestorRect = ancestor.getBoundingClientRect();
      const left = ancestorRect.left + ancestor.clientLeft;
      const top = ancestorRect.top + ancestor.clientTop;
      const right = left + ancestor.clientWidth;
      const bottom = top + ancestor.clientHeight;
      if (clipsX) {
        visible.left = Math.max(visible.left, left);
        visible.right = Math.min(visible.right, right);
      }
      if (clipsY) {
        visible.top = Math.max(visible.top, top);
        visible.bottom = Math.min(visible.bottom, bottom);
      }
      clippingAncestors.push({
        tag: ancestor.tagName,
        className: ancestor.className,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        left,
        top,
        right,
        bottom,
      });
    }

    return {
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      visible,
      clippingAncestors,
      fullyVisible:
        rect.left >= visible.left &&
        rect.top >= visible.top &&
        rect.right <= visible.right &&
        rect.bottom <= visible.bottom,
    };
  });
}

async function verifyMatrixCardScrollAccess(page: Page, symbol: string) {
  const guitar = page.locator(
    `.matrix-panel [data-testid="mini-guitar-card-visual"][data-chord-symbol="${symbol}"]`,
  );
  const matrixBoard = page.locator(".matrix-spatial-board");
  const before = await guitar.evaluate((element) => {
    const board = element.closest<HTMLElement>(".matrix-spatial-board");
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const chordCard = element.closest<HTMLElement>(".chord-card");
    if (!board || !shell || !chordCard) return null;
    const cardRect = chordCard.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    return {
      scrollLeft: board.scrollLeft,
      scrollWidth: board.scrollWidth,
      clientWidth: board.clientWidth,
      cardLeft: cardRect.left,
      cardRight: cardRect.right,
      appShellLeft: shellRect.left,
      appShellRight: shellRect.right,
    };
  });
  expect(before, `${symbol} has a Matrix scroll parent`).not.toBeNull();
  if (!before) throw new Error(`${symbol} has no Matrix scroll parent`);
  expect(before.scrollWidth, `${symbol} Matrix content exceeds its scrollport`).toBeGreaterThan(
    before.clientWidth,
  );
  expect(before.cardRight, `${symbol} starts outside the clipped app shell`).toBeGreaterThan(
    before.appShellRight,
  );

  const chordCard = guitar.locator("xpath=ancestor::article[contains(@class, 'chord-card')][1]");
  await matrixBoard.scrollIntoViewIfNeeded();
  await chordCard.scrollIntoViewIfNeeded();
  await centerCardInViewport(chordCard);
  const after = await guitar.evaluate((element) => {
    const board = element.closest<HTMLElement>(".matrix-spatial-board");
    const shell = document.querySelector<HTMLElement>(".app-shell");
    const chordCard = element.closest<HTMLElement>(".chord-card");
    const svg = element.querySelector("svg");
    const legend = element.querySelector<HTMLElement>(".guitar-fingering-legend");
    if (!board || !shell || !chordCard || !svg || !legend) return null;

    const visible = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const clippingAncestors: string[] = [];
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const clipsX = style.overflowX !== "visible";
      const clipsY = style.overflowY !== "visible";
      if (!clipsX && !clipsY) continue;
      const rect = ancestor.getBoundingClientRect();
      const left = rect.left + ancestor.clientLeft;
      const top = rect.top + ancestor.clientTop;
      const right = left + ancestor.clientWidth;
      const bottom = top + ancestor.clientHeight;
      if (clipsX) {
        visible.left = Math.max(visible.left, left);
        visible.right = Math.min(visible.right, right);
      }
      if (clipsY) {
        visible.top = Math.max(visible.top, top);
        visible.bottom = Math.min(visible.bottom, bottom);
      }
      clippingAncestors.push(`${ancestor.tagName}.${String(ancestor.className)}`);
    }
    const headerBottom = document.querySelector(".app-header")?.getBoundingClientRect().bottom ?? 0;
    visible.top = Math.max(visible.top, headerBottom + 8);
    visible.bottom = Math.min(visible.bottom, window.innerHeight - 8);
    const cardRect = chordCard.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const legendRect = legend.getBoundingClientRect();
    const fullyInsideVisibleBounds = (rect: DOMRect) =>
      rect.left >= visible.left &&
      rect.top >= visible.top &&
      rect.right <= visible.right &&
      rect.bottom <= visible.bottom;
    const hit = document.elementFromPoint(
      (cardRect.left + cardRect.right) / 2,
      (cardRect.top + cardRect.bottom) / 2,
    );
    const shellRect = shell.getBoundingClientRect();
    return {
      scrollLeft: board.scrollLeft,
      scrollWidth: board.scrollWidth,
      clientWidth: board.clientWidth,
      visible,
      card: {
        left: cardRect.left,
        top: cardRect.top,
        right: cardRect.right,
        bottom: cardRect.bottom,
      },
      diagram: {
        left: svgRect.left,
        top: svgRect.top,
        right: svgRect.right,
        bottom: svgRect.bottom,
      },
      legend: {
        left: legendRect.left,
        top: legendRect.top,
        right: legendRect.right,
        bottom: legendRect.bottom,
      },
      fullyVisible:
        fullyInsideVisibleBounds(cardRect) &&
        fullyInsideVisibleBounds(svgRect) &&
        fullyInsideVisibleBounds(legendRect),
      insideAppShell:
        cardRect.left >= shellRect.left &&
        cardRect.right <= shellRect.right &&
        cardRect.top >= shellRect.top &&
        cardRect.bottom <= shellRect.bottom,
      hitTestPassed: Boolean(hit && chordCard.contains(hit)),
      clippingAncestors,
    };
  });
  expect(after, `${symbol} has a visible Guitar diagram and legend`).not.toBeNull();
  if (!after) throw new Error(`${symbol} disappeared while scrolling the Matrix`);
  expect(after.scrollLeft, `${symbol} is reachable by horizontal Matrix scrolling`).toBeGreaterThan(
    before.scrollLeft,
  );
  expect(
    after.fullyVisible,
    `${symbol} card, diagram, and legend fit the visible scrollport: ${JSON.stringify(after)}`,
  ).toBe(true);
  expect(after.insideAppShell, `${symbol} is no longer clipped by the app shell`).toBe(true);
  expect(after.hitTestPassed, `${symbol} accepts a pointer hit after scrolling`).toBe(true);
  await expect(guitar).toBeVisible();
  return { chord: symbol, before, after };
}

async function captureViewport(page: Page, card: Locator, testInfo: TestInfo, filename: string) {
  await centerCardInViewport(card);
  await expect(card).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath(filename), animations: "disabled" });
}

test("T213 keeps guitar marker colors accessible and consistent across views and layouts", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  for (const functionId of ["I", "IV"]) {
    const chord = page.getByTestId(`chord-card-${functionId}`).locator(".chord-main");
    await chord.focus();
    await page.keyboard.press("Control+Enter");
  }
  await expect(page.getByTestId("piano-roll-chord")).toHaveCount(2);

  await chooseViewItem(page, "matrix-card-view-guitar");
  await chooseViewItem(page, "progression-card-view-piano-roll");
  await page.getByRole("button", { name: "Show guitar chord", exact: true }).first().click();
  const defaultViewMenu = await openViewMenu(page);
  await expect(defaultViewMenu.getByTestId("guitar-chord-color-mode-chord-roles")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("Escape");

  const matrixGuitars = page.locator('.matrix-panel [data-testid="mini-guitar-card-visual"]');
  const progressionGuitars = page.locator(
    '.piano-roll-card-row [data-testid="mini-guitar-card-visual"]',
  );
  let activeTheme: Theme = "light";
  let activeOrientation: Orientation = "horizontal";
  let activeMode: ColorMode = "chord-roles";

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const theme of ["light", "dark"] as const) {
      if (theme !== activeTheme) {
        await page
          .getByRole("button", { name: theme === "light" ? "Light theme" : "Dark theme" })
          .click();
        activeTheme = theme;
      }
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);

      for (const orientation of ["vertical", "horizontal"] as const) {
        if (orientation !== activeOrientation) {
          await chooseViewItem(page, "toggle-guitar-orientation");
          activeOrientation = orientation;
        }

        for (const mode of ["chord-roles", "fingering"] as const) {
          if (mode !== activeMode) {
            await chooseColorModeByKeyboard(page, mode);
            activeMode = mode;
          }

          const matrixConsistent = await matrixGuitars.evaluateAll(
            (cards, expected) =>
              cards.length > 0 &&
              cards.every(
                (card) =>
                  card.getAttribute("data-color-mode") === expected.mode &&
                  card.getAttribute("data-orientation") === expected.orientation,
              ),
            { mode, orientation },
          );
          const progressionConsistent = await progressionGuitars.evaluateAll(
            (cards, expected) =>
              cards.length === 2 &&
              cards.every(
                (card) =>
                  card.getAttribute("data-color-mode") === expected.mode &&
                  card.getAttribute("data-orientation") === expected.orientation,
              ),
            { mode, orientation },
          );
          expect(matrixConsistent, `Matrix ${mode}/${orientation}`).toBe(true);
          expect(progressionConsistent, `My Progression ${mode}/${orientation}`).toBe(true);

          const matrixCard = matrixGuitars.first();
          const progressionCard = progressionGuitars.first();
          const expectedDescription =
            mode === "fingering" ? "Fingering colors" : "Chord-role colors";
          await expect(matrixCard.locator("svg")).toHaveAttribute(
            "aria-label",
            new RegExp(expectedDescription),
          );
          await expect(progressionCard.locator("svg")).toHaveAttribute(
            "aria-label",
            new RegExp(expectedDescription),
          );

          const legendCount = await page.locator(".matrix-panel .guitar-fingering-legend").count();
          const progressionLegendCount = await page
            .locator(".piano-roll-card-row .guitar-fingering-legend")
            .count();
          if (mode === "fingering") {
            expect(legendCount).toBeGreaterThan(0);
            expect(progressionLegendCount).toBe(2);
            await expect(
              matrixCard.getByRole("group", { name: "Guitar finger color legend" }),
            ).toBeVisible();
            await expect(
              progressionCard.getByRole("group", { name: "Guitar finger color legend" }),
            ).toBeVisible();

            const fingerColors = await matrixGuitars.evaluateAll((cards) =>
              Object.fromEntries(
                ["1", "2", "3", "4"].map((finger) => {
                  const marker = cards
                    .map((card) =>
                      card.querySelector<SVGCircleElement>(
                        `.guitar-dot-finger[data-finger="${finger}"]`,
                      ),
                    )
                    .find((candidate) => candidate !== null);
                  return [finger, marker ? getComputedStyle(marker).fill : null];
                }),
              ),
            );
            expect(fingerColors).toEqual({
              "1": "rgb(247, 170, 6)",
              "2": "rgb(201, 32, 255)",
              "3": "rgb(0, 175, 254)",
              "4": "rgb(245, 110, 80)",
            });

            const rootTextFill = await page
              .locator(
                ".matrix-panel .guitar-fret-dot-group.is-root[data-finger] .guitar-dot-finger-text",
              )
              .first()
              .evaluate((marker) => getComputedStyle(marker).fill);
            expect(rootTextFill).toBe("rgb(17, 24, 39)");

            const openRootClasses = await page
              .locator('.matrix-panel .guitar-string-marker.is-open[aria-label*="chord root"]')
              .evaluateAll((markers) => markers.map((marker) => [...marker.classList]));
            expect(openRootClasses.length).toBeGreaterThan(0);
            expect(openRootClasses.every((classes) => classes.includes("is-neutral"))).toBe(true);
            expect(openRootClasses.every((classes) => !classes.includes("is-root"))).toBe(true);
          } else {
            expect(legendCount).toBe(0);
            expect(progressionLegendCount).toBe(0);
            const openRootClasses = await page
              .locator('.matrix-panel .guitar-string-marker.is-open[aria-label*="chord root"]')
              .evaluateAll((markers) => markers.map((marker) => [...marker.classList]));
            expect(openRootClasses.length).toBeGreaterThan(0);
            expect(openRootClasses.every((classes) => classes.includes("is-root"))).toBe(true);
            expect(openRootClasses.every((classes) => !classes.includes("is-neutral"))).toBe(true);
          }

          if (orientation === "horizontal") {
            const matrixFitFailures = await matrixGuitars.evaluateAll((cards) =>
              cards
                .map((card) => {
                  const svg = card.querySelector("svg");
                  const parent = card.closest(".chord-card");
                  if (!svg || !parent)
                    return { chord: card.getAttribute("data-chord-symbol"), missing: true };
                  const svgRect = svg.getBoundingClientRect();
                  const cardRect = parent.getBoundingClientRect();
                  const legend = card.querySelector(".guitar-fingering-legend");
                  const legendRect = legend?.getBoundingClientRect();
                  const clippingAncestors: HTMLElement[] = [];
                  for (
                    let ancestor = card.parentElement;
                    ancestor;
                    ancestor = ancestor.parentElement
                  ) {
                    const overflowX = getComputedStyle(ancestor).overflowX;
                    if (overflowX === "hidden" || overflowX === "clip")
                      clippingAncestors.push(ancestor);
                  }
                  const svgInsideCard =
                    svgRect.left >= cardRect.left && svgRect.right <= cardRect.right;
                  const legendInsideCard =
                    !legendRect ||
                    (legendRect.left >= cardRect.left &&
                      legendRect.right <= cardRect.right &&
                      legendRect.bottom <= cardRect.bottom);
                  const clippedBy = clippingAncestors
                    .filter((ancestor) => {
                      const rect = ancestor.getBoundingClientRect();
                      return svgRect.left < rect.left || svgRect.right > rect.right;
                    })
                    .map((ancestor) => ({
                      selector: ancestor.className,
                      overflowX: getComputedStyle(ancestor).overflowX,
                      left: ancestor.getBoundingClientRect().left,
                      right: ancestor.getBoundingClientRect().right,
                    }));
                  const spatialBoard = card.closest<HTMLElement>(".matrix-spatial-board");
                  const boardRect = spatialBoard?.getBoundingClientRect();
                  const scrollportLeft = boardRect ? boardRect.left + spatialBoard!.clientLeft : 0;
                  const cardStart = spatialBoard
                    ? cardRect.left - scrollportLeft + spatialBoard.scrollLeft
                    : 0;
                  const minScrollLeft = spatialBoard
                    ? Math.max(0, cardStart + cardRect.width - spatialBoard.clientWidth)
                    : Number.POSITIVE_INFINITY;
                  const maxScrollLeft = spatialBoard
                    ? Math.min(cardStart, spatialBoard.scrollWidth - spatialBoard.clientWidth)
                    : Number.NEGATIVE_INFINITY;
                  const reachableThroughSpatialScroll =
                    Boolean(spatialBoard) &&
                    spatialBoard!.scrollWidth > spatialBoard!.clientWidth &&
                    cardRect.width <= spatialBoard!.clientWidth &&
                    minScrollLeft <= maxScrollLeft;
                  const clipsAreReachable =
                    clippedBy.length === 0 ||
                    (clippedBy.every((ancestor) => ancestor.selector === "app-shell") &&
                      reachableThroughSpatialScroll);
                  return svgInsideCard && legendInsideCard && clipsAreReachable
                    ? null
                    : {
                        chord: card.getAttribute("data-chord-symbol"),
                        svgLeft: svgRect.left,
                        svgRight: svgRect.right,
                        cardLeft: cardRect.left,
                        cardRight: cardRect.right,
                        svgInsideCard,
                        legendInsideCard,
                        clippedBy,
                        spatialScroll: {
                          clientWidth: spatialBoard?.clientWidth ?? null,
                          scrollWidth: spatialBoard?.scrollWidth ?? null,
                          canReachWholeCard: reachableThroughSpatialScroll,
                        },
                      };
                })
                .filter((failure) => failure !== null)
                .slice(0, 5),
            );
            expect(matrixFitFailures, `Matrix horizontal fit at ${viewport.width}`).toEqual([]);
            if (
              viewport.width === 640 &&
              theme === "dark" &&
              orientation === "horizontal" &&
              mode === "fingering"
            ) {
              const appShellOverflow = await matrixGuitars.evaluateAll((cards) => {
                const shell = document.querySelector<HTMLElement>(".app-shell");
                if (!shell) return [];
                const shellRect = shell.getBoundingClientRect();
                return cards
                  .map((card) => {
                    const rect = card.closest(".chord-card")?.getBoundingClientRect();
                    return rect && (rect.left < shellRect.left || rect.right > shellRect.right)
                      ? {
                          chord: card.getAttribute("data-chord-symbol"),
                          cardLeft: rect.left,
                          cardRight: rect.right,
                          appShellLeft: shellRect.left,
                          appShellRight: shellRect.right,
                          ancestors: (() => {
                            const chain: Array<{
                              tag: string;
                              className: string;
                              left: number;
                              right: number;
                              clientWidth: number;
                              scrollWidth: number;
                              overflowX: string;
                              display: string;
                            }> = [];
                            let node: HTMLElement | null = card.parentElement;
                            while (node && chain.length < 10) {
                              const nodeRect = node.getBoundingClientRect();
                              const style = getComputedStyle(node);
                              chain.push({
                                tag: node.tagName,
                                className: node.className,
                                left: nodeRect.left,
                                right: nodeRect.right,
                                clientWidth: node.clientWidth,
                                scrollWidth: node.scrollWidth,
                                overflowX: style.overflowX,
                                display: style.display,
                              });
                              node = node.parentElement;
                            }
                            return chain;
                          })(),
                        }
                      : null;
                  })
                  .filter((card) => card !== null);
              });
              const overflowDiagnosticPath = testInfo.outputPath(
                "t213-matrix-offscreen-cards-640x360.json",
              );
              await writeFile(
                overflowDiagnosticPath,
                JSON.stringify(appShellOverflow, null, 2),
                "utf8",
              );
              await testInfo.attach("t213-matrix-offscreen-cards-640x360.json", {
                path: overflowDiagnosticPath,
                contentType: "application/json",
              });

              const matrixScrollReachability = [];
              for (const [symbol, slug] of [
                ["Db7", "Db7"],
                ["B°", "B-diminished"],
              ] as const) {
                const evidence = await verifyMatrixCardScrollAccess(page, symbol);
                matrixScrollReachability.push(evidence);
                await page.screenshot({
                  path: testInfo.outputPath(
                    `640x360-dark-vertical-fingering-matrix-${slug}-reachable.png`,
                  ),
                  animations: "disabled",
                });
                await page.locator(".matrix-spatial-board").evaluate((board, scrollLeft) => {
                  board.scrollLeft = scrollLeft;
                }, evidence.before.scrollLeft);
              }
              const reachabilityPath = testInfo.outputPath(
                "t213-matrix-scroll-reachability-640x360.json",
              );
              await writeFile(
                reachabilityPath,
                JSON.stringify(matrixScrollReachability, null, 2),
                "utf8",
              );
              await testInfo.attach("t213-matrix-scroll-reachability-640x360.json", {
                path: reachabilityPath,
                contentType: "application/json",
              });
            }
            const progressionFits = await progressionGuitars.evaluateAll((cards) =>
              cards.every((card) => {
                const svg = card.querySelector("svg");
                const wrap = card.querySelector(".mini-guitar-fretboard-wrap");
                if (!svg || !wrap) return false;
                const svgRect = svg.getBoundingClientRect();
                const wrapRect = wrap.getBoundingClientRect();
                const legend = card.querySelector(".guitar-fingering-legend");
                const visualRect = card.getBoundingClientRect();
                const legendRect = legend?.getBoundingClientRect();
                return (
                  svgRect.left >= wrapRect.left &&
                  svgRect.right <= wrapRect.right &&
                  (!legendRect ||
                    (legendRect.left >= visualRect.left &&
                      legendRect.right <= visualRect.right &&
                      legendRect.bottom <= visualRect.bottom))
                );
              }),
            );
            expect(progressionFits, `My Progression horizontal fit at ${viewport.width}`).toBe(
              true,
            );
          }

          const stem = `${viewport.width}x${viewport.height}-${theme}-${orientation}-${mode}`;
          if (mode === "fingering") {
            await centerCardInViewport(matrixCard);
            const matrixLegend = matrixCard.getByRole("group", {
              name: "Guitar finger color legend",
            });
            await revealBelowStickyHeader(matrixLegend);
            const matrixLegendVisibility = await measureVisibleBounds(matrixLegend);
            expect(
              matrixLegendVisibility.fullyVisible,
              `The complete Matrix finger legend is visible after scrolling at ${viewport.width}x${viewport.height}`,
            ).toBe(true);
            await captureCard(matrixCard, testInfo, `${stem}-matrix-detail.png`);
            await captureViewport(page, matrixCard, testInfo, `${stem}-matrix-viewport.png`);
            await centerCardInViewport(progressionCard);
            const progressionLegend = progressionCard.getByRole("group", {
              name: "Guitar finger color legend",
            });
            await revealBelowStickyHeader(progressionLegend);
            const progressionLegendVisibility = await measureVisibleBounds(progressionLegend);
            expect(
              progressionLegendVisibility.fullyVisible,
              `The complete Progression finger legend is visible after scrolling at ${viewport.width}x${viewport.height}`,
            ).toBe(true);
            await captureCard(progressionCard, testInfo, `${stem}-progression-detail.png`);
            await captureViewport(
              page,
              progressionCard,
              testInfo,
              `${stem}-progression-viewport.png`,
            );
            if (viewport.width === 640 && theme === "dark" && orientation === "vertical") {
              await revealBelowStickyHeader(progressionLegend);
              const legendVisibility = await measureVisibleBounds(progressionLegend);
              const legendEvidencePath = testInfo.outputPath(
                "t213-progression-legend-visible-bounds-640x360.json",
              );
              await writeFile(
                legendEvidencePath,
                JSON.stringify(legendVisibility, null, 2),
                "utf8",
              );
              await testInfo.attach("t213-progression-legend-visible-bounds-640x360.json", {
                path: legendEvidencePath,
                contentType: "application/json",
              });
              expect(
                legendVisibility.fullyVisible,
                "The complete finger legend is visible below the sticky header after scrolling",
              ).toBe(true);
              const legendScreenshot = testInfo.outputPath(
                "640x360-dark-vertical-fingering-progression-legend-visible.png",
              );
              await page.screenshot({ path: legendScreenshot, animations: "disabled" });
            }
          } else {
            await captureViewport(page, matrixCard, testInfo, `${stem}-matrix-viewport.png`);
            await captureViewport(
              page,
              progressionCard,
              testInfo,
              `${stem}-progression-viewport.png`,
            );
          }
        }
      }
    }
  }

  await page.emulateMedia({ media: "print" });
  const printable = page.getByTestId("printable-progression");
  await expect(printable).toBeVisible();
  const printDiagrams = printable.locator(".printable-guitar-diagram svg");
  await expect(printDiagrams).toHaveCount(2);
  await expect(printDiagrams.first()).toHaveAttribute("data-color-mode", "chord-roles");
  await expect(printDiagrams.first()).toHaveAttribute("data-orientation", "horizontal");
  await expect(printable.locator(".guitar-fingering-legend")).toHaveCount(0);
  const printDotStyle = await printable
    .locator(".printable-guitar-diagram .guitar-dot-root")
    .first()
    .evaluate((dot) => ({
      fill: getComputedStyle(dot).fill,
      stroke: getComputedStyle(dot).stroke,
    }));
  expect(printDotStyle).toEqual({ fill: "rgb(255, 255, 255)", stroke: "rgb(17, 24, 39)" });
});
