export interface PlaybackFollowPosition {
  readonly systemIndex: number;
  readonly viewKey: string;
  readonly targetElement: HTMLElement;
  readonly scrollContainer: HTMLElement;
  readonly contentElement: HTMLElement;
  /** Horizontal cursor position as a fraction of contentElement's width. */
  readonly horizontalOffsetRatio: number;
}

interface CachedGeometry {
  readonly targetTop: number;
  readonly targetHeight: number;
  readonly contentLeft: number;
  readonly contentWidth: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
}

const FOLLOW_EDGE_MARGIN_PX = 72;
const HORIZONTAL_FOLLOW_INTERVAL_MS = 160;
const MANUAL_GESTURE_THRESHOLD_PX = 8;
const SCROLL_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
  " ",
]);

function isElement(target: EventTarget | null): target is Element {
  return typeof Element !== "undefined" && target instanceof Element;
}

function isEditableTextTarget(target: Element): boolean {
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable='true'], [contenteditable=''], [role='textbox'], [data-playback-follow-ignore]",
    ),
  );
}

function isInteractiveKeyTarget(target: Element): boolean {
  return isEditableTextTarget(target) || Boolean(target.closest("button, [role='button']"));
}

function hasRoomToScroll(element: HTMLElement, deltaX: number, deltaY: number): boolean {
  if (deltaY !== 0 && element.scrollHeight > element.clientHeight) {
    const maxTop = element.scrollHeight - element.clientHeight;
    if ((deltaY < 0 && element.scrollTop > 0) || (deltaY > 0 && element.scrollTop < maxTop))
      return true;
  }
  if (deltaX !== 0 && element.scrollWidth > element.clientWidth) {
    const maxLeft = element.scrollWidth - element.clientWidth;
    if ((deltaX < 0 && element.scrollLeft > 0) || (deltaX > 0 && element.scrollLeft < maxLeft))
      return true;
  }
  return false;
}

function nestedScrollerForIntent(
  target: Element,
  root: HTMLElement | null,
  deltaX: number,
  deltaY: number,
): HTMLElement | null {
  for (let ancestor = target.parentElement; ancestor && ancestor !== root;) {
    if (
      ancestor.hasAttribute("data-playback-follow-nested-scroll") &&
      hasRoomToScroll(ancestor, deltaX, deltaY)
    ) {
      return ancestor;
    }
    ancestor = ancestor.parentElement;
  }
  return null;
}

/** App-owned, session-only owner of automatic playback scrolling. */
export class PlaybackFollowCoordinator {
  #following = true;
  #listeners = new Set<() => void>();
  #position: PlaybackFollowPosition | null = null;
  #root: HTMLElement | null = null;
  #listenedScrollContainer: HTMLElement | null = null;
  #observedPosition: PlaybackFollowPosition | null = null;
  #geometry: CachedGeometry | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #cacheFrame: number | null = null;
  #lastHorizontalFollowAt = 0;
  #touchStart: { readonly x: number; readonly y: number; readonly target: Element } | null = null;

  readonly getSnapshot = (): boolean => this.#following;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  reportPosition(position: PlaybackFollowPosition): void {
    const previous = this.#position;
    const targetChanged =
      !previous ||
      previous.systemIndex !== position.systemIndex ||
      previous.targetElement !== position.targetElement ||
      previous.scrollContainer !== position.scrollContainer ||
      previous.viewKey !== position.viewKey;
    const geometryChanged = targetChanged || previous.contentElement !== position.contentElement;
    const needsVerticalRecenter =
      !previous ||
      previous.systemIndex !== position.systemIndex ||
      previous.targetElement !== position.targetElement ||
      previous.scrollContainer !== position.scrollContainer ||
      previous.viewKey !== position.viewKey;
    this.#position = position;
    this.#ensureListeners(position.targetElement);
    if (geometryChanged || !this.#geometry) this.#refreshGeometry();
    if (!this.#following) return;
    if (needsVerticalRecenter) this.#followVertical();
    this.#followHorizontal(false);
  }

  suspend(): void {
    this.#setFollowing(false);
  }

  resume(): void {
    this.#setFollowing(true);
    if (!this.#position) return;
    this.#refreshGeometry();
    this.#followVertical();
    this.#followHorizontal(true);
  }

  /** Stops following the prior session and centers the first score system in the workspace. */
  rewindToStart(): void {
    this.reset();
    const root = document.querySelector<HTMLElement>(".app-shell > .studio-grid");
    const targetElement = root?.querySelector<HTMLElement>(
      '[data-testid="progression-score-system"][data-system-index="0"]',
    );
    const scrollContainer = targetElement?.querySelector<HTMLElement>(".score-system-scroll");
    if (!root || !targetElement || !scrollContainer) return;

    const rootBounds = root.getBoundingClientRect();
    const targetBounds = targetElement.getBoundingClientRect();
    const centerDelta =
      targetBounds.top + targetBounds.height / 2 - (rootBounds.top + root.clientHeight / 2);
    const maxScrollTop = Math.max(0, root.scrollHeight - root.clientHeight);
    root.scrollTo({
      top: Math.max(0, Math.min(maxScrollTop, root.scrollTop + centerDelta)),
      behavior: this.#scrollBehavior(),
    });
    if (scrollContainer.scrollLeft !== 0) {
      scrollContainer.scrollTo({ left: 0, behavior: this.#scrollBehavior() });
    }
  }

  reset(): void {
    this.#detachListeners();
    this.#setFollowing(true);
    this.#position = null;
    this.#geometry = null;
    this.#touchStart = null;
  }

  dispose(): void {
    this.#detachListeners();
    this.#position = null;
    this.#geometry = null;
    this.#listeners.clear();
  }

  #setFollowing(following: boolean): void {
    if (this.#following === following) return;
    this.#following = following;
    this.#listeners.forEach((listener) => listener());
  }

  #findRoot(target: HTMLElement): HTMLElement | null {
    const studioGrid = target.closest<HTMLElement>(".studio-grid");
    return studioGrid?.parentElement?.matches(".app-shell") ? studioGrid : null;
  }

  #ensureListeners(target: HTMLElement): void {
    const root = this.#findRoot(target);
    if (!root) {
      if (this.#root) this.#detachListeners();
      return;
    }
    if (this.#root !== root) {
      this.#detachListeners();
      this.#root = root;
      root.addEventListener("wheel", this.#onWheel, { passive: true });
      root.addEventListener("pointerdown", this.#onPointerDown, { passive: true, capture: true });
      root.addEventListener("touchstart", this.#onTouchStart, { passive: true });
      root.addEventListener("touchmove", this.#onTouchMove, { passive: true });
      root.addEventListener("touchend", this.#onTouchEnd, { passive: true });
      root.addEventListener("touchcancel", this.#onTouchEnd, { passive: true });
      document.addEventListener("keydown", this.#onKeyDown);
      window.addEventListener("resize", this.#onResize, { passive: true });
      root.addEventListener("scroll", this.#onScroll, { passive: true });
    }
    const position = this.#position;
    if (!position) return;
    if (this.#listenedScrollContainer !== position.scrollContainer) {
      this.#listenedScrollContainer?.removeEventListener("scroll", this.#onScroll);
      position.scrollContainer.addEventListener("scroll", this.#onScroll, { passive: true });
      this.#listenedScrollContainer = position.scrollContainer;
    }
    if (
      !this.#observedPosition ||
      this.#observedPosition.targetElement !== position.targetElement ||
      this.#observedPosition.scrollContainer !== position.scrollContainer ||
      this.#observedPosition.contentElement !== position.contentElement
    ) {
      this.#resizeObserver?.disconnect();
      this.#resizeObserver = null;
      if (typeof ResizeObserver !== "undefined") {
        this.#resizeObserver = new ResizeObserver(this.#onResize);
        this.#resizeObserver.observe(root);
        this.#resizeObserver.observe(position.targetElement);
        this.#resizeObserver.observe(position.scrollContainer);
        this.#resizeObserver.observe(position.contentElement);
      }
      this.#observedPosition = position;
    }
  }

  #detachListeners(): void {
    const root = this.#root;
    if (root) {
      root.removeEventListener("wheel", this.#onWheel);
      root.removeEventListener("pointerdown", this.#onPointerDown, true);
      root.removeEventListener("touchstart", this.#onTouchStart);
      root.removeEventListener("touchmove", this.#onTouchMove);
      root.removeEventListener("touchend", this.#onTouchEnd);
      root.removeEventListener("touchcancel", this.#onTouchEnd);
      root.removeEventListener("scroll", this.#onScroll);
    }
    this.#listenedScrollContainer?.removeEventListener("scroll", this.#onScroll);
    this.#listenedScrollContainer = null;
    if (root) {
      document.removeEventListener("keydown", this.#onKeyDown);
      window.removeEventListener("resize", this.#onResize);
    }
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#observedPosition = null;
    if (this.#cacheFrame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.#cacheFrame);
    }
    this.#cacheFrame = null;
    this.#root = null;
  }

  #onResize = (): void => {
    if (!this.#position) return;
    this.#refreshGeometry();
    if (this.#following) {
      this.#followVertical();
      this.#followHorizontal(true);
    }
  };

  #onScroll = (): void => {
    if (this.#cacheFrame !== null) return;
    if (typeof requestAnimationFrame !== "function") {
      this.#refreshGeometry();
      return;
    }
    this.#cacheFrame = requestAnimationFrame(() => {
      this.#cacheFrame = null;
      this.#refreshGeometry();
    });
  };

  #onWheel = (event: WheelEvent): void => {
    if (!this.#position || !isElement(event.target)) return;
    const target = event.target;
    if (isEditableTextTarget(target)) return;
    const scoreScroller = target.closest<HTMLElement>(".score-system-scroll");
    if (scoreScroller && event.deltaX !== 0) {
      this.suspend();
      return;
    }
    const nestedScroller = nestedScrollerForIntent(target, this.#root, event.deltaX, event.deltaY);
    if (nestedScroller && !nestedScroller.matches(".score-system-scroll")) {
      return;
    }
    if (event.deltaX !== 0 || event.deltaY !== 0) this.suspend();
  };

  #onPointerDown = (event: PointerEvent): void => {
    if (!this.#root || !isElement(event.target)) return;
    const target = event.target;
    const bounds = this.#root.getBoundingClientRect();
    const verticalGutter = Math.max(this.#root.offsetWidth - this.#root.clientWidth, 8);
    if (target === this.#root && event.clientX >= bounds.right - verticalGutter) {
      this.suspend();
      return;
    }
    const scroller = target.closest<HTMLElement>(".score-system-scroll");
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return;
    const scrollerBounds = scroller.getBoundingClientRect();
    const horizontalGutter = Math.max(scroller.offsetHeight - scroller.clientHeight, 8);
    if (event.clientY >= scrollerBounds.bottom - horizontalGutter) this.suspend();
  };

  #onTouchStart = (event: TouchEvent): void => {
    const touch = event.touches[0];
    if (!touch || !isElement(event.target)) return;
    this.#touchStart = { x: touch.clientX, y: touch.clientY, target: event.target };
  };

  #onTouchMove = (event: TouchEvent): void => {
    const start = this.#touchStart;
    const touch = event.touches[0];
    if (!start || !touch) return;
    const deltaX = start.x - touch.clientX;
    const deltaY = start.y - touch.clientY;
    if (
      Math.abs(deltaX) < MANUAL_GESTURE_THRESHOLD_PX &&
      Math.abs(deltaY) < MANUAL_GESTURE_THRESHOLD_PX
    )
      return;
    if (isEditableTextTarget(start.target)) return;
    if (start.target.closest(".score-system-scroll")) {
      this.suspend();
      this.#touchStart = null;
      return;
    }
    const nestedScroller = nestedScrollerForIntent(start.target, this.#root, deltaX, deltaY);
    if (nestedScroller && !nestedScroller.matches(".score-system-scroll")) {
      return;
    }
    this.suspend();
    this.#touchStart = null;
  };

  #onTouchEnd = (): void => {
    this.#touchStart = null;
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    if (
      event.defaultPrevented ||
      !SCROLL_KEYS.has(event.key) ||
      !this.#root ||
      !isElement(event.target) ||
      (!this.#root.contains(event.target) &&
        event.target !== document.body &&
        event.target !== document.documentElement) ||
      isInteractiveKeyTarget(event.target)
    ) {
      return;
    }
    this.suspend();
  };

  #refreshGeometry(): void {
    const position = this.#position;
    const root = this.#root;
    if (!position || !root) return;
    const rootRect = root.getBoundingClientRect();
    const targetRect = position.targetElement.getBoundingClientRect();
    const containerRect = position.scrollContainer.getBoundingClientRect();
    const contentRect = position.contentElement.getBoundingClientRect();
    this.#geometry = {
      targetTop: targetRect.top - rootRect.top + root.scrollTop,
      targetHeight: targetRect.height,
      contentLeft: contentRect.left - containerRect.left + position.scrollContainer.scrollLeft,
      contentWidth: contentRect.width,
      scrollWidth: position.scrollContainer.scrollWidth,
      clientWidth: position.scrollContainer.clientWidth,
    };
  }

  #scrollBehavior(): ScrollBehavior {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
  }

  #followVertical(): void {
    const position = this.#position;
    const geometry = this.#geometry;
    const root = this.#root;
    if (!position || !geometry || !root) return;
    const targetCenter = geometry.targetTop + geometry.targetHeight / 2;
    const desiredTop = Math.max(0, targetCenter - root.clientHeight / 2);
    if (Math.abs(desiredTop - root.scrollTop) > 2) {
      root.scrollTo({ top: desiredTop, behavior: this.#scrollBehavior() });
    }
    // Keep the cached position aligned with the intended scroll while scroll events arrive.
    this.#geometry = { ...geometry, targetTop: targetCenter - root.clientHeight / 2 };
  }

  #followHorizontal(forceCenter: boolean): void {
    const position = this.#position;
    const geometry = this.#geometry;
    if (!position || !geometry || geometry.scrollWidth <= geometry.clientWidth) return;
    const cursorX =
      geometry.contentLeft +
      Math.max(0, Math.min(1, position.horizontalOffsetRatio)) * geometry.contentWidth;
    const visibleX = cursorX - position.scrollContainer.scrollLeft;
    const nearEdge =
      visibleX < FOLLOW_EDGE_MARGIN_PX || visibleX > geometry.clientWidth - FOLLOW_EDGE_MARGIN_PX;
    if (!forceCenter && !nearEdge) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!forceCenter && now - this.#lastHorizontalFollowAt < HORIZONTAL_FOLLOW_INTERVAL_MS) return;
    const desiredLeft = Math.max(0, cursorX - geometry.clientWidth / 2);
    if (Math.abs(desiredLeft - position.scrollContainer.scrollLeft) > 3) {
      position.scrollContainer.scrollTo({ left: desiredLeft, behavior: this.#scrollBehavior() });
      this.#lastHorizontalFollowAt = now;
    }
  }
}
