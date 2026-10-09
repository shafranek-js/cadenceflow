// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuitarHandLegendModal } from "../../../src/ui/guitar/GuitarHandLegendModal";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The guitar fingering legend declares `aria-modal="true"`, so assistive technology treats
 * everything outside it as inert. Two things must therefore hold: focus must move into the dialog,
 * and Tab must not walk out of it into content the user cannot see.
 *
 * Regression context: the modal had only a `window` keydown listener for Escape — no Tab trap and
 * no focus restoration. Keyboard users could tab into the page behind the dialog, and closing it
 * left focus on `document.body` rather than the control that opened it.
 */

interface Mounted {
  readonly container: HTMLDivElement;
  readonly root: Root;
  readonly onClose: ReturnType<typeof vi.fn>;
  unmount(): void;
}

function mountLegend(): Mounted {
  const onClose = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(GuitarHandLegendModal, {
        onClose,
        fingeringStyle: "badge",
        onSetFingeringStyle: () => undefined,
      }),
    );
  });
  return {
    container,
    root,
    onClose,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function dialog(): HTMLElement {
  const element = document.body.querySelector<HTMLElement>('[role="dialog"]');
  if (!element) throw new Error("no dialog rendered");
  return element;
}

/** All focusable controls inside the dialog, in document order. */
function focusables(): HTMLElement[] {
  return Array.from(
    dialog().querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

function pressKey(key: string, shiftKey = false): void {
  act(() => {
    // `useModalFocus` registers on `window` with `capture: true`, and an event dispatched on
    // `document` never reaches `window` during the bubble phase — so the event must be dispatched
    // on `window` itself, and with `capture` so the capture-phase listener sees it.
    window.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
  });
}

function pressTab(shiftKey = false): void {
  pressKey("Tab", shiftKey);
}

describe("GuitarHandLegendModal keyboard access", () => {
  const mounted: Mounted[] = [];

  afterEach(() => {
    for (const item of mounted.splice(0)) item.unmount();
    document.body.innerHTML = "";
  });

  it("moves focus into the dialog on open", async () => {
    const item = mountLegend();
    mounted.push(item);

    // `useModalFocus` places initial focus on the next animation frame, which is asynchronous even
    // under jsdom.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    const active = document.activeElement as HTMLElement | null;
    expect(active).not.toBeNull();
    expect(dialog().contains(active)).toBe(true);
    expect(focusables().length).toBeGreaterThan(0);
  });

  it("wraps Tab from the last control back to the first", () => {
    const item = mountLegend();
    mounted.push(item);

    const controls = focusables();
    expect(controls.length).toBeGreaterThan(1);

    const last = controls[controls.length - 1]!;
    last.focus();
    expect(document.activeElement).toBe(last);

    pressTab(false);

    // The trap must have moved focus back inside the dialog rather than out of it.
    const active = document.activeElement as HTMLElement | null;
    expect(dialog().contains(active)).toBe(true);
  });

  it("closes on Escape", () => {
    const item = mountLegend();
    mounted.push(item);

    pressKey("Escape");

    expect(item.onClose).toHaveBeenCalled();
  });

  it("restores focus to the previously focused element on close", () => {
    const opener = document.createElement("button");
    opener.textContent = "open legend";
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const item = mountLegend();
    mounted.push(item);

    act(() => {
      item.root.unmount();
    });

    expect(document.activeElement).toBe(opener);
  });
});
