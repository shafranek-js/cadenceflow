// @vitest-environment jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { HelpCenterModal } from "../../../src/ui/help/HelpCenterModal";
import { AppMenuBar } from "../../../src/ui/studio/AppMenuBar";

const el = React.createElement;

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return {
    container,
    rerender(nextElement: React.ReactElement) {
      act(() => root.render(nextElement));
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("HelpCenterModal component", () => {
  it("renders with overview tab and title", () => {
    const onClose = vi.fn();
    const mounted = mount(
      el(HelpCenterModal, {
        onClose,
        initialTab: "overview",
      }),
    );

    const title = document.body.querySelector("#help-center-title");
    expect(title).not.toBeNull();
    expect(title?.textContent).toContain("Справочный центр CadenceFlow");

    const activeTabBtn = document.body.querySelector(".help-tab-button.active");
    expect(activeTabBtn?.textContent).toContain("Быстрый старт");

    mounted.unmount();
  });

  it("switches tabs when clicking sidebar tab buttons", () => {
    const onClose = vi.fn();
    const mounted = mount(
      el(HelpCenterModal, {
        onClose,
        initialTab: "overview",
      }),
    );

    const guitarTabBtn = document.body.querySelector<HTMLButtonElement>('[data-testid="help-tab-guitar"]');
    expect(guitarTabBtn).not.toBeNull();

    act(() => {
      guitarTabBtn!.click();
    });

    // Content should now show guitar section with FretFlow colors
    const article = document.body.querySelector(".help-article");
    expect(article?.textContent).toContain("Гитара, табулатура и аппликатура");
    expect(article?.textContent).toContain("Стандарт FretFlow");
    expect(article?.textContent).toContain("#f7aa06");
    expect(article?.textContent).toContain("#c920ff");
    expect(article?.textContent).toContain("#00affe");
    expect(article?.textContent).toContain("#f56e50");

    mounted.unmount();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    const mounted = mount(
      el(HelpCenterModal, {
        onClose,
        initialTab: "overview",
      }),
    );

    const closeBtn = document.body.querySelector<HTMLButtonElement>(".dialog-close-btn");
    expect(closeBtn).not.toBeNull();
    act(() => {
      closeBtn!.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    mounted.unmount();
  });
});

describe("AppMenuBar with Help dropdown", () => {
  it("renders Help menu button alongside Project, Export, Edit, View", () => {
    const onOpenHelp = vi.fn();
    const onOpenFingeringLegend = vi.fn();
    const onOpenShortcutsHelp = vi.fn();

    const mounted = mount(
      el(AppMenuBar, {
        projectMenu: el("div", null, "Project"),
        exportMenu: el("div", null, "Export"),
        canUndo: true,
        onUndo: vi.fn(),
        canRedo: false,
        onRedo: vi.fn(),
        cardView: "harmonic",
        onCardViewChange: vi.fn(),
        progressionView: "tablature",
        onProgressionViewChange: vi.fn(),
        showBassInStaff: true,
        onShowBassInStaffChange: vi.fn(),
        onOpenHelp,
        onOpenFingeringLegend,
        onOpenShortcutsHelp,
      }),
    );

    const helpTrigger = mounted.container.querySelector<HTMLButtonElement>('[data-testid="help-menu-toggle"]');
    expect(helpTrigger).not.toBeNull();
    expect(helpTrigger?.textContent?.trim()).toBe("Help");

    // Open Help dropdown
    act(() => {
      helpTrigger!.click();
    });

    const helpMenu = mounted.container.querySelector("#help-menu");
    expect(helpMenu).not.toBeNull();

    const helpCenterItem = mounted.container.querySelector<HTMLButtonElement>('[data-testid="menu-open-help-center"]');
    expect(helpCenterItem).not.toBeNull();
    expect(helpCenterItem?.textContent).toContain("Справочный центр");

    act(() => {
      helpCenterItem!.click();
    });
    expect(onOpenHelp).toHaveBeenCalledTimes(1);

    mounted.unmount();
  });
});
