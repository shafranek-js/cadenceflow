import { expect, test, type Page } from "@playwright/test";
import { musicalDuration } from "../../src/domain/timing/duration";
import { rational } from "../../src/domain/timing/rational";
import type { Project } from "../../src/domain/project/project";
import { encodePortableProject } from "../../src/persistence/portableProject";
import { createPianoRollSystemChordFixture } from "../fixtures/piano-roll-system-chord.fixture";

const viewports = [
  { name: "narrow", width: 640, height: 360 },
  { name: "standard", width: 1280, height: 720 },
  { name: "large", width: 1920, height: 1080 },
  // The smaller CSS viewport represents a 125% zoomed 1280×720 window.
  { name: "standard at 125% zoom", width: 1024, height: 576 },
] as const;

function withSameMeasureChordPair(project: Project): Project {
  const [first, second, ...tail] = project.progression.steps;
  if (!first || !second) throw new Error("The Studio scroll fixture needs two leading Steps");
  const spacer = Object.freeze({
    id: "status-scroll-spacer-rest",
    kind: "rest" as const,
    duration: musicalDuration(rational(4)),
  });
  return Object.freeze({
    ...project,
    progression: Object.freeze({
      ...project.progression,
      steps: Object.freeze([
        Object.freeze({ ...first, duration: musicalDuration(rational(2)) }),
        Object.freeze({ ...second, duration: musicalDuration(rational(2)) }),
        spacer,
        ...tail,
      ]),
    }),
  });
}

async function importPortableFixture(page: Page, project: Project): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("project-menu-toggle")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("project-menu-toggle").click();
  await page.getByTestId("project-open-file-btn").click();
  await page.getByTestId("project-file-input").setInputFiles({
    name: `${project.id}.cadenceflow`,
    mimeType: "application/json",
    buffer: Buffer.from(encodePortableProject(project), "utf8"),
  });
  await expect(page.getByTestId("project-menu-toggle")).toContainText(project.name);
  await expect(page.getByTestId("progression-view-btn-piano-roll")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
}

test.describe("T214 persistent status bar", () => {
  for (const viewport of viewports) {
    test(`stays at the window bottom and leaves keyboard focus clear at ${viewport.name}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/", { waitUntil: "domcontentloaded" });

      const statusBar = page.getByRole("contentinfo", { name: "Status bar" });
      const studioGrid = page.getByRole("region", { name: "Studio work area" });
      await expect(statusBar).toBeVisible();
      await expect(studioGrid).toBeVisible();
      await expect(statusBar.getByTestId("piano-audio-status")).toBeVisible();

      const themeStyles: string[] = [];
      for (const theme of ["light", "dark"] as const) {
        await page.evaluate((value) => {
          document.documentElement.setAttribute("data-theme", value);
        }, theme);
        await studioGrid.evaluate((element) => {
          element.scrollTop = 0;
        });
        const appearance = await statusBar.evaluate((element) => {
          const style = getComputedStyle(element);
          return { background: style.backgroundColor, color: style.color };
        });
        expect(appearance.background).not.toBe("rgba(0, 0, 0, 0)");
        expect(appearance.color).not.toBe("rgba(0, 0, 0, 0)");
        themeStyles.push(`${appearance.background}/${appearance.color}`);

        const atTop = await statusBar.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const getVisibleBounds = (control: HTMLElement) => {
            const bounds = control.getBoundingClientRect();
            let top = Math.max(0, bounds.top);
            let bottom = Math.min(window.innerHeight, bounds.bottom);
            let left = Math.max(0, bounds.left);
            let right = Math.min(window.innerWidth, bounds.right);
            for (
              let ancestor = control.parentElement;
              ancestor;
              ancestor = ancestor.parentElement
            ) {
              const style = getComputedStyle(ancestor);
              const ancestorRect = ancestor.getBoundingClientRect();
              if (["auto", "clip", "hidden", "scroll"].includes(style.overflowY)) {
                top = Math.max(top, ancestorRect.top);
                bottom = Math.min(bottom, ancestorRect.bottom);
              }
              if (["auto", "clip", "hidden", "scroll"].includes(style.overflowX)) {
                left = Math.max(left, ancestorRect.left);
                right = Math.min(right, ancestorRect.right);
              }
            }
            return { top, bottom, left, right };
          };
          const overlappingControls = Array.from(
            document.querySelectorAll<HTMLElement>(
              'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
            ),
          )
            .filter((control) => !element.contains(control))
            .map((control) => ({
              label: control.getAttribute("aria-label") ?? control.textContent?.trim() ?? "",
              bounds: getVisibleBounds(control),
            }))
            .filter(
              ({ bounds }) =>
                bounds.bottom > rect.top &&
                bounds.top < rect.bottom &&
                bounds.right > rect.left &&
                bounds.left < rect.right &&
                bounds.bottom > 0 &&
                bounds.top < window.innerHeight,
            )
            .map(({ label, bounds }) => ({
              label,
              top: bounds.top,
              bottom: bounds.bottom,
            }));
          return {
            bottom: rect.bottom,
            viewportHeight: window.innerHeight,
            overlappingControls,
          };
        });

        expect(
          atTop.viewportHeight - atTop.bottom,
          `${viewport.name} ${theme} status at initial scroll position`,
        ).toBeLessThanOrEqual(1);
        expect(
          atTop.overlappingControls,
          `${viewport.name} ${theme} visible controls below status bar: ${JSON.stringify(atTop.overlappingControls)}`,
        ).toEqual([]);

        await page.screenshot({
          path: testInfo.outputPath(`${viewport.name}-${theme}-at-top.png`),
          animations: "disabled",
        });

        await page.evaluate(() => {
          const scrollingElement = document.querySelector<HTMLElement>(".studio-grid");
          if (scrollingElement) scrollingElement.scrollTop = scrollingElement.scrollHeight;
        });

        const metrics = await statusBar.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const scrollingElement = document.querySelector<HTMLElement>(".studio-grid");
          return {
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            position: getComputedStyle(element).position,
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth,
            maxScroll: scrollingElement
              ? scrollingElement.scrollHeight - scrollingElement.clientHeight
              : 0,
          };
        });

        expect(metrics.maxScroll, `${viewport.name} ${theme} page is scrollable`).toBeGreaterThan(
          0,
        );
        expect(metrics.position).toBe("static");
        expect(metrics.top).toBeGreaterThanOrEqual(0);
        expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
        expect(metrics.viewportHeight - metrics.bottom).toBeLessThanOrEqual(1);
        expect(metrics.left).toBeGreaterThanOrEqual(0);
        expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth);

        await page.screenshot({
          path: testInfo.outputPath(`${viewport.name}-${theme}-scrolled.png`),
          animations: "disabled",
        });

        for (let tab = 0; tab < 36; tab += 1) {
          await page.keyboard.press("Tab");
          const focus = await page.evaluate(() => {
            const activeElement = document.activeElement;
            const status = document.querySelector<HTMLElement>(".app-status-bar");
            if (
              !(activeElement instanceof HTMLElement) ||
              activeElement === document.body ||
              activeElement === document.documentElement ||
              !status
            ) {
              return null;
            }
            const activeRect = activeElement.getBoundingClientRect();
            const statusRect = status.getBoundingClientRect();
            const studioGrid = document.querySelector<HTMLElement>(".studio-grid");
            const gridRect = studioGrid?.getBoundingClientRect();
            const isVisible =
              activeRect.bottom > 0 &&
              activeRect.top < window.innerHeight &&
              activeRect.right > 0 &&
              activeRect.left < window.innerWidth &&
              (!gridRect ||
                (activeRect.bottom > gridRect.top &&
                  activeRect.top < gridRect.bottom &&
                  activeRect.right > gridRect.left &&
                  activeRect.left < gridRect.right));
            const overlapsStatusBar =
              activeRect.bottom > statusRect.top &&
              activeRect.top < statusRect.bottom &&
              activeRect.right > statusRect.left &&
              activeRect.left < statusRect.right;
            return {
              isVisible,
              insideStatusBar: status.contains(activeElement),
              overlapsStatusBar,
              target: `${activeElement.tagName.toLowerCase()}.${activeElement.className}`,
              activeTop: activeRect.top,
              activeBottom: activeRect.bottom,
              statusTop: statusRect.top,
              statusBottom: statusRect.bottom,
              viewportHeight: window.innerHeight,
            };
          });

          if (focus?.isVisible && !focus.insideStatusBar) {
            expect(
              focus.overlapsStatusBar,
              `${viewport.name} ${theme} keyboard focus ${JSON.stringify(focus)}`,
            ).toBe(false);
            expect(
              focus.viewportHeight - focus.statusBottom,
              `${viewport.name} ${theme} status remains pinned during keyboard scroll`,
            ).toBeLessThanOrEqual(1);
          }
        }
      }
      expect(new Set(themeStyles).size, `${viewport.name} light/dark status styling`).toBe(2);
    });
  }

  test("Piano Roll boundary drag scrolls the Studio region while the status bar stays pinned", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 360 });
    const fixture = withSameMeasureChordPair(createPianoRollSystemChordFixture());
    await importPortableFixture(page, fixture);

    const studioGrid = page.locator(".studio-grid");
    const statusBar = page.getByRole("contentinfo", { name: "Status bar" });
    await page.locator('.piano-roll-chord[data-source-step-id="chord-a"]').first().click();
    const boundary = page.locator(
      '.piano-roll-chord-boundary-handle[data-boundary-step-id="chord-a"][data-boundary-edge="right"]',
    );
    await expect(boundary).toBeVisible();
    await boundary.scrollIntoViewIfNeeded();
    const originalBoundary = await boundary.getAttribute("aria-valuenow");
    const boundaryBox = await boundary.boundingBox();
    if (!boundaryBox) throw new Error("The Piano Roll boundary has no visible bounds");
    const scrollBeforeDrag = await studioGrid.evaluate((element) => element.scrollTop);
    const start = {
      x: boundaryBox.x + boundaryBox.width / 2,
      y: boundaryBox.y + boundaryBox.height / 2,
    };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let move = 0; move < 8; move += 1) {
      await page.mouse.move(start.x, page.viewportSize()!.height - 8);
      await page.waitForTimeout(40);
    }

    await expect(page.getByTestId("duration-resize-status")).toContainText("Preview boundary");
    expect(await studioGrid.evaluate((element) => element.scrollTop)).toBeGreaterThan(
      scrollBeforeDrag,
    );
    const statusBounds = await statusBar.boundingBox();
    expect(statusBounds).toBeTruthy();
    expect(Math.abs(statusBounds!.y + statusBounds!.height - 360)).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath("boundary-autoscroll-status-pinned.png"),
      animations: "disabled",
    });

    await boundary.evaluate((element) =>
      element.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 })),
    );
    await page.mouse.up();
    await expect(page.getByTestId("duration-resize-status")).toHaveCount(0);
    await expect(boundary).toHaveAttribute("aria-valuenow", originalBoundary!);
  });
});
