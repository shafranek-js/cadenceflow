import { useState, useCallback, useMemo, type DragEvent, type KeyboardEvent } from "react";

export interface UseReorderableSectionsOptions<T extends string = string> {
  readonly storageKey: string;
  readonly defaultOrder: readonly T[];
}

export interface DropIndicator<T extends string = string> {
  readonly targetId: T;
  readonly position: "before" | "after";
}

export interface SectionItemProps {
  readonly draggable: boolean;
  readonly "data-section-id": string;
  readonly onDragStart: (event: DragEvent<HTMLElement>) => void;
  readonly onDragOver: (event: DragEvent<HTMLElement>) => void;
  readonly onDragLeave: (event: DragEvent<HTMLElement>) => void;
  readonly onDrop: (event: DragEvent<HTMLElement>) => void;
  readonly onDragEnd: () => void;
  readonly className: string;
}

export interface DragHandleProps {
  readonly role: string;
  readonly tabIndex: number;
  readonly "aria-label": string;
  readonly title: string;
  readonly className: string;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

export interface UseReorderableSectionsResult<T extends string = string> {
  readonly order: readonly T[];
  readonly draggingId: T | null;
  readonly dropIndicator: DropIndicator<T> | null;
  readonly isCustomOrder: boolean;
  readonly getSectionItemProps: (id: T) => SectionItemProps;
  readonly getDragHandleProps: (id: T, label?: string) => DragHandleProps;
  readonly moveSection: (id: T, direction: "up" | "down") => void;
  readonly resetOrder: () => void;
}

function sanitizeOrder<T extends string>(saved: unknown, defaultOrder: readonly T[]): T[] {
  if (!Array.isArray(saved)) {
    return [...defaultOrder];
  }
  const validSaved = saved.filter(
    (item): item is T => typeof item === "string" && defaultOrder.includes(item as T),
  );
  const result: T[] = [...validSaved];
  for (const item of defaultOrder) {
    if (!result.includes(item)) {
      result.push(item);
    }
  }
  return result;
}

function readStoredOrder<T extends string>(storageKey: string, defaultOrder: readonly T[]): T[] {
  if (typeof window === "undefined") {
    return [...defaultOrder];
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [...defaultOrder];
    const parsed = JSON.parse(raw);
    return sanitizeOrder(parsed, defaultOrder);
  } catch {
    return [...defaultOrder];
  }
}

function persistOrder<T extends string>(storageKey: string, order: readonly T[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(order));
  } catch {
    // Best-effort storage
  }
}

export function useReorderableSections<T extends string = string>({
  storageKey,
  defaultOrder,
}: UseReorderableSectionsOptions<T>): UseReorderableSectionsResult<T> {
  const [order, setOrder] = useState<readonly T[]>(() => readStoredOrder(storageKey, defaultOrder));
  const [draggingId, setDraggingId] = useState<T | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator<T> | null>(null);

  const isCustomOrder = useMemo(() => {
    if (order.length !== defaultOrder.length) return true;
    return order.some((id, index) => id !== defaultOrder[index]);
  }, [order, defaultOrder]);

  const moveSection = useCallback(
    (id: T, direction: "up" | "down") => {
      setOrder((prev) => {
        const index = prev.indexOf(id);
        if (index === -1) return prev;
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= prev.length) return prev;

        const next = [...prev];
        const [removed] = next.splice(index, 1);
        if (removed !== undefined) {
          next.splice(targetIndex, 0, removed);
        }
        persistOrder(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const resetOrder = useCallback(() => {
    setOrder([...defaultOrder]);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
  }, [defaultOrder, storageKey]);

  const handleDragStart = useCallback((id: T, event: DragEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".inspector-disclosure-body")) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDraggingId(id);
  }, []);

  const handleDragOver = useCallback((id: T, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const rect = event.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position: "before" | "after" = event.clientY < midY ? "before" : "after";

    setDropIndicator({ targetId: id, position });
  }, []);

  const handleDragLeave = useCallback((id: T, event: DragEvent<HTMLElement>) => {
    const currentTarget = event.currentTarget;
    const related = event.relatedTarget as Node | null;
    if (currentTarget && related && currentTarget.contains(related)) {
      return;
    }
    setDropIndicator((prev) => (prev?.targetId === id ? null : prev));
  }, []);

  const handleDrop = useCallback(
    (targetId: T, event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const sourceId = (draggingId ?? event.dataTransfer.getData("text/plain")) as T;

      if (!sourceId || sourceId === targetId || !defaultOrder.includes(sourceId)) {
        setDraggingId(null);
        setDropIndicator(null);
        return;
      }

      setOrder((prev) => {
        const withoutSource = prev.filter((item) => item !== sourceId);
        const targetIndex = withoutSource.indexOf(targetId);
        if (targetIndex === -1) return prev;

        const insertIndex = dropIndicator?.position === "after" ? targetIndex + 1 : targetIndex;

        const next = [...withoutSource];
        next.splice(insertIndex, 0, sourceId);
        persistOrder(storageKey, next);
        return next;
      });

      setDraggingId(null);
      setDropIndicator(null);
    },
    [draggingId, defaultOrder, dropIndicator, storageKey],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropIndicator(null);
  }, []);

  const getSectionItemProps = useCallback(
    (id: T): SectionItemProps => {
      const isDragging = draggingId === id;
      const isDropTarget = dropIndicator?.targetId === id;
      const dropClass = isDropTarget
        ? dropIndicator.position === "before"
          ? " drag-over-before"
          : " drag-over-after"
        : "";

      return {
        draggable: true,
        "data-section-id": id,
        onDragStart: (e) => handleDragStart(id, e),
        onDragOver: (e) => handleDragOver(id, e),
        onDragLeave: (e) => handleDragLeave(id, e),
        onDrop: (e) => handleDrop(id, e),
        onDragEnd: handleDragEnd,
        className: `inspector-reorderable-section${isDragging ? " is-dragging" : ""}${dropClass}`,
      };
    },
    [
      draggingId,
      dropIndicator,
      handleDragStart,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handleDragEnd,
    ],
  );

  const getDragHandleProps = useCallback(
    (id: T, label?: string): DragHandleProps => ({
      role: "button",
      tabIndex: 0,
      "aria-label": label ? `Reorder ${label} section` : `Reorder section`,
      title: "Drag to reorder (or use Arrow keys)",
      className: "inspector-drag-handle",
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveSection(id, "up");
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          moveSection(id, "down");
        }
      },
    }),
    [moveSection],
  );

  return {
    order,
    draggingId,
    dropIndicator,
    isCustomOrder,
    getSectionItemProps,
    getDragHandleProps,
    moveSection,
    resetOrder,
  };
}
