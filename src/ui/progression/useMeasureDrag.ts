import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { isNoOpMeasureDrop, measureDropTarget, type MeasureDropRect } from "./measureDragModel";

/**
 * Click-and-drag reordering of whole Measures in the piano-roll.
 *
 * Deliberately built on pointer events rather than HTML5 drag-and-drop: the gesture has to run
 * *inside* the piano-roll grid, which already owns pointer interactions (marquee selection, note
 * dragging, boundary resize handles), and native DnD cannot be mixed with them without the browser
 * hijacking the gesture.
 *
 * The drag only *starts* after the pointer has moved past a small threshold, so a plain click on the
 * header still selects the Measure and a right-click still opens its menu.
 */

/** Movement in pixels before a press turns into a drag. */
export const MEASURE_DRAG_THRESHOLD_PX = 4;

interface PendingDrag {
  readonly fromMeasureIndex: number;
  readonly pointerId: number;
  readonly originX: number;
  readonly originY: number;
  active: boolean;
}

export interface MeasureDragApi {
  /** Measure currently lifted by the pointer, or null. */
  readonly draggingMeasureIndex: number | null;
  /** Flat Measure index the drag would insert before, or null when not dragging. */
  readonly dropSlot: number | null;
  /** Viewport x of the insertion caret, or null when not dragging. */
  /** System row the drop lands in, or null when not dragging. */
  readonly dropSystemIndex: number | null;
  /** Viewport position of the pointer while dragging, so a preview can follow it. */
  readonly cursor: { readonly x: number; readonly y: number } | null;
  /** Attach to the Measure header's `onPointerDown`. */
  begin(measureIndex: number, event: ReactPointerEvent<HTMLElement>): void;
}

export interface MeasureDragOptions {
  /** Element that contains every rendered Measure. */
  readonly containerRef: RefObject<HTMLElement | null>;
  /** Drag is only possible in the piano-roll view. */
  readonly enabled: boolean;
  readonly onCommit: (fromMeasureIndex: number, toInsertIndex: number) => void;
}

export function useMeasureDrag({
  containerRef,
  enabled,
  onCommit,
}: MeasureDragOptions): MeasureDragApi {
  const [draggingMeasureIndex, setDraggingMeasureIndex] = useState<number | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const [dropSystemIndex, setDropSystemIndex] = useState<number | null>(null);
  const [cursor, setCursor] = useState<{ readonly x: number; readonly y: number } | null>(null);
  const pendingRef = useRef<PendingDrag | null>(null);
  const commitRef = useRef(onCommit);
  // Kept in sync in an effect rather than during render: writing a ref while rendering is what
  // `react-hooks/refs` forbids, and it would also publish a callback the committed tree never had.
  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  const collectRects = useCallback((): readonly MeasureDropRect[] => {
    const nodes = containerRef.current?.querySelectorAll<HTMLElement>(".piano-roll-measure");
    if (!nodes) return [];
    const rects: MeasureDropRect[] = [];
    for (const node of nodes) {
      const measureIndex = Number(node.dataset.measureIndex);
      const systemIndex = Number(node.dataset.systemIndex);
      if (!Number.isInteger(measureIndex) || !Number.isInteger(systemIndex)) continue;
      const rect = node.getBoundingClientRect();
      rects.push({
        measureIndex,
        systemIndex,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      });
    }
    return rects;
  }, [containerRef]);

  const reset = useCallback(() => {
    pendingRef.current = null;
    setDraggingMeasureIndex(null);
    setDropSlot(null);
    setDropSystemIndex(null);
    setCursor(null);
  }, []);

  const begin = useCallback(
    (measureIndex: number, event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      if (event.button !== 0) return;
      pendingRef.current = {
        fromMeasureIndex: measureIndex,
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        active: false,
      };
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return undefined;

    const onPointerMove = (event: PointerEvent) => {
      const pending = pendingRef.current;
      // Ignore other pointers so a second finger or a stylus cannot hijack an in-flight drag.
      if (!pending || event.pointerId !== pending.pointerId) return;
      if (!pending.active) {
        const travelled =
          Math.abs(event.clientX - pending.originX) + Math.abs(event.clientY - pending.originY);
        if (travelled < MEASURE_DRAG_THRESHOLD_PX) return;
        pending.active = true;
        setDraggingMeasureIndex(pending.fromMeasureIndex);
      }
      setCursor({ x: event.clientX, y: event.clientY });
      const target = measureDropTarget(collectRects(), { x: event.clientX, y: event.clientY });
      setDropSlot(target?.slot ?? null);
      setDropSystemIndex(target?.systemIndex ?? null);
    };

    const onPointerUp = (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending || event.pointerId !== pending.pointerId) return;
      const target = pending.active
        ? measureDropTarget(collectRects(), { x: event.clientX, y: event.clientY })
        : null;
      const slot = target?.slot ?? null;
      const from = pending.fromMeasureIndex;
      const wasActive = pending.active;
      reset();
      if (wasActive && slot !== null && !isNoOpMeasureDrop(from, slot)) {
        commitRef.current(from, slot);
      }
    };

    const onPointerCancel = (event: PointerEvent) => {
      const pending = pendingRef.current;
      if (!pending || event.pointerId !== pending.pointerId) return;
      reset();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !pendingRef.current) return;
      reset();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown, true);
      reset();
    };
  }, [collectRects, enabled, reset]);

  return { draggingMeasureIndex, dropSlot, dropSystemIndex, cursor, begin };
}
