import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaybackFollowCoordinator } from "../../../src/ui/transport/playbackFollowCoordinator";

let dom: JSDOM | null = null;

afterEach(() => {
  dom?.window.close();
  dom = null;
  vi.unstubAllGlobals();
});

function createWorkspace() {
  dom = new JSDOM(
    '<div class="app-shell"><div class="studio-grid"><section class="target" data-testid="progression-score-system" data-system-index="0"><div class="score-system-scroll"><div class="content"><button class="piano-roll-note">Note</button><input></div></div></section><aside class="inspector-stack" data-playback-follow-nested-scroll><button class="inspector-action">Inspector</button></aside></div></div>',
  );
  const testWindow = dom.window;
  vi.stubGlobal("window", testWindow);
  vi.stubGlobal("document", testWindow.document);
  vi.stubGlobal("Element", testWindow.Element);
  vi.stubGlobal("HTMLElement", testWindow.HTMLElement);
  vi.stubGlobal("ResizeObserver", undefined);
  vi.stubGlobal("requestAnimationFrame", undefined);
  const root = testWindow.document.querySelector<HTMLElement>(".studio-grid")!;
  const target = testWindow.document.querySelector<HTMLElement>(".target")!;
  const scrollContainer = testWindow.document.querySelector<HTMLElement>(".score-system-scroll")!;
  const content = testWindow.document.querySelector<HTMLElement>(".content")!;
  const note = testWindow.document.querySelector<HTMLElement>(".piano-roll-note")!;
  const input = testWindow.document.querySelector<HTMLInputElement>("input")!;
  const inspector = testWindow.document.querySelector<HTMLElement>(".inspector-stack")!;
  const inspectorAction = testWindow.document.querySelector<HTMLElement>(".inspector-action")!;
  const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect;
  Object.defineProperty(root, "clientWidth", { configurable: true, value: 400 });
  Object.defineProperty(root, "clientHeight", { configurable: true, value: 400 });
  Object.defineProperty(root, "offsetWidth", { configurable: true, value: 416 });
  Object.defineProperty(root, "scrollHeight", { configurable: true, value: 1000 });
  Object.defineProperty(scrollContainer, "clientWidth", { configurable: true, value: 200 });
  Object.defineProperty(scrollContainer, "clientHeight", { configurable: true, value: 120 });
  Object.defineProperty(scrollContainer, "scrollWidth", { configurable: true, value: 600 });
  Object.defineProperty(inspector, "scrollHeight", { configurable: true, value: 600 });
  Object.defineProperty(inspector, "clientHeight", { configurable: true, value: 200 });
  Object.defineProperty(content, "getBoundingClientRect", {
    configurable: true,
    value: () => rect(100 - scrollContainer.scrollLeft, 400 - root.scrollTop, 600, 120),
  });
  Object.defineProperty(root, "getBoundingClientRect", {
    configurable: true,
    value: () => rect(100, 100, 416, 400),
  });
  Object.defineProperty(target, "getBoundingClientRect", {
    configurable: true,
    value: vi.fn(() => rect(100, 400 - root.scrollTop, 400, 120)),
  });
  Object.defineProperty(scrollContainer, "getBoundingClientRect", {
    configurable: true,
    value: () => rect(100, 400 - root.scrollTop, 200, 120),
  });
  Object.defineProperty(root, "scrollTo", {
    configurable: true,
    value: vi.fn(({ top }: ScrollToOptions) => {
      if (typeof top === "number") root.scrollTop = top;
    }),
  });
  Object.defineProperty(scrollContainer, "scrollTo", {
    configurable: true,
    value: vi.fn(({ left }: ScrollToOptions) => {
      if (typeof left === "number") scrollContainer.scrollLeft = left;
    }),
  });
  const coordinator = new PlaybackFollowCoordinator();
  const position = {
    systemIndex: 0,
    viewKey: "piano-roll",
    targetElement: target,
    scrollContainer,
    contentElement: content,
    horizontalOffsetRatio: 0.9,
  } as const;
  return {
    coordinator,
    position,
    root,
    target,
    scrollContainer,
    content,
    note,
    input,
    inspector,
    inspectorAction,
    testWindow,
  };
}

describe("PlaybackFollowCoordinator", () => {
  it("starts enabled and notifies only when follow state changes", () => {
    const coordinator = new PlaybackFollowCoordinator();
    const listener = vi.fn();
    coordinator.subscribe(listener);

    expect(coordinator.getSnapshot()).toBe(true);
    coordinator.suspend();
    coordinator.suspend();
    expect(coordinator.getSnapshot()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    coordinator.resume();
    coordinator.resume();
    expect(coordinator.getSnapshot()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it("keeps manual suspension through position reports until Resume follow", () => {
    const coordinator = new PlaybackFollowCoordinator();
    const listener = vi.fn();
    coordinator.subscribe(listener);
    coordinator.suspend();

    const noRootElement = { closest: () => null } as unknown as HTMLElement;
    coordinator.reportPosition({
      systemIndex: 0,
      viewKey: "piano-roll",
      targetElement: noRootElement,
      scrollContainer: noRootElement,
      contentElement: noRootElement,
      horizontalOffsetRatio: 0.5,
    });
    coordinator.reportPosition({
      systemIndex: 0,
      viewKey: "staff",
      targetElement: noRootElement,
      scrollContainer: noRootElement,
      contentElement: noRootElement,
      horizontalOffsetRatio: 0.5,
    });

    expect(coordinator.getSnapshot()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    coordinator.resume();
    expect(coordinator.getSnapshot()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it("resets to enabled and clears the stale cursor for a new playback session", () => {
    const coordinator = new PlaybackFollowCoordinator();
    const listener = vi.fn();
    coordinator.subscribe(listener);
    coordinator.suspend();
    coordinator.reset();

    expect(coordinator.getSnapshot()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it("centers the active system and cursor using cached geometry, including on a view switch", () => {
    const workspace = createWorkspace();
    const { coordinator, position, root, target, scrollContainer } = workspace;
    const targetRect = vi.spyOn(target, "getBoundingClientRect");

    coordinator.reportPosition(position);
    expect(root.scrollTo).toHaveBeenCalledWith({ top: 160, behavior: "smooth" });
    expect(scrollContainer.scrollTo).toHaveBeenCalledWith({ left: 440, behavior: "smooth" });
    const readsAfterInitialPosition = targetRect.mock.calls.length;
    coordinator.reportPosition({ ...position, horizontalOffsetRatio: 0.91 });
    expect(targetRect).toHaveBeenCalledTimes(readsAfterInitialPosition);

    root.scrollTop = 260;
    coordinator.reportPosition({ ...position, viewKey: "tablature" });
    expect(root.scrollTo).toHaveBeenCalledTimes(2);
    expect(root.scrollTo).toHaveBeenLastCalledWith({ top: 160, behavior: "smooth" });
    coordinator.dispose();
  });

  it("suspends on manual intent, keeps the newest cursor, and resumes at that cursor", () => {
    const { coordinator, position, root, scrollContainer, note, input, testWindow } =
      createWorkspace();
    coordinator.reportPosition(position);
    root.dispatchEvent(new testWindow.Event("scroll"));
    expect(coordinator.getSnapshot()).toBe(true);

    note.dispatchEvent(new testWindow.WheelEvent("wheel", { bubbles: true, deltaY: 120 }));
    expect(coordinator.getSnapshot()).toBe(false);
    const rootWritesWhileSuspended = (root.scrollTo as ReturnType<typeof vi.fn>).mock.calls.length;
    const horizontalWritesWhileSuspended = (scrollContainer.scrollTo as ReturnType<typeof vi.fn>)
      .mock.calls.length;
    root.scrollTop = 260;
    scrollContainer.scrollLeft = 300;
    root.dispatchEvent(new testWindow.Event("scroll"));
    scrollContainer.dispatchEvent(new testWindow.Event("scroll"));
    coordinator.reportPosition({ ...position, horizontalOffsetRatio: 0.25 });
    expect(root.scrollTo).toHaveBeenCalledTimes(rootWritesWhileSuspended);
    expect(scrollContainer.scrollTo).toHaveBeenCalledTimes(horizontalWritesWhileSuspended);

    coordinator.resume();
    expect(coordinator.getSnapshot()).toBe(true);
    expect(root.scrollTo).toHaveBeenLastCalledWith({ top: 160, behavior: "smooth" });
    expect(scrollContainer.scrollTo).toHaveBeenLastCalledWith({ left: 50, behavior: "smooth" });

    note.dispatchEvent(new testWindow.KeyboardEvent("keydown", { bubbles: true, key: "ArrowUp" }));
    expect(coordinator.getSnapshot()).toBe(true);
    input.dispatchEvent(
      new testWindow.KeyboardEvent("keydown", { bubbles: true, key: "PageDown" }),
    );
    expect(coordinator.getSnapshot()).toBe(true);
    root.dispatchEvent(new testWindow.MouseEvent("pointerdown", { bubbles: true, clientX: 515 }));
    expect(coordinator.getSnapshot()).toBe(false);
    testWindow.document.body.dispatchEvent(
      new testWindow.KeyboardEvent("keydown", { bubbles: true, key: "PageDown" }),
    );
    expect(coordinator.getSnapshot()).toBe(false);

    coordinator.reset();
    const pointerDown = new testWindow.MouseEvent("pointerdown", { bubbles: true, clientX: 515 });
    root.dispatchEvent(pointerDown);
    expect(coordinator.getSnapshot()).toBe(true);
    coordinator.dispose();
  });

  it("leaves follow enabled while a marked nested inspector can consume wheel input", () => {
    const { coordinator, position, inspector, inspectorAction, testWindow } = createWorkspace();
    coordinator.reportPosition(position);

    inspectorAction.dispatchEvent(
      new testWindow.WheelEvent("wheel", { bubbles: true, deltaY: 120 }),
    );
    expect(coordinator.getSnapshot()).toBe(true);

    inspector.scrollTop = 400;
    inspectorAction.dispatchEvent(
      new testWindow.WheelEvent("wheel", { bubbles: true, deltaY: 120 }),
    );
    expect(coordinator.getSnapshot()).toBe(false);
    coordinator.dispose();
  });

  it("rewinds to the first system and clears manual suspension after the prior session reset", () => {
    const { coordinator, position, root, scrollContainer, testWindow } = createWorkspace();
    coordinator.reportPosition(position);
    coordinator.suspend();
    root.scrollTop = 260;
    scrollContainer.scrollLeft = 300;
    coordinator.reset();

    coordinator.rewindToStart();

    expect(coordinator.getSnapshot()).toBe(true);
    expect(root.scrollTo).toHaveBeenLastCalledWith({ top: 160, behavior: "smooth" });
    expect(scrollContainer.scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "smooth" });
    coordinator.dispose();
    testWindow.close();
  });
});
