export interface RangeSelectionState {
  readonly anchorId: string | null;
  readonly focusId: string | null;
  readonly stepIds: readonly string[];
}

export const EMPTY_RANGE_SELECTION: RangeSelectionState = Object.freeze({
  anchorId: null,
  focusId: null,
  stepIds: Object.freeze([]),
});

export type RangeSelectionAction =
  | { readonly type: "click"; readonly stepId: string }
  | { readonly type: "extend"; readonly stepId: string }
  | { readonly type: "marquee"; readonly stepIds: readonly string[] }
  | { readonly type: "sync"; readonly orderedStepIds: readonly string[] }
  | { readonly type: "clear" };

function rangeBetween(
  orderedStepIds: readonly string[],
  firstId: string,
  secondId: string,
): readonly string[] {
  const firstIndex = orderedStepIds.indexOf(firstId);
  const secondIndex = orderedStepIds.indexOf(secondId);
  if (firstIndex < 0 || secondIndex < 0) return Object.freeze([]);
  const start = Math.min(firstIndex, secondIndex);
  const end = Math.max(firstIndex, secondIndex);
  return Object.freeze(orderedStepIds.slice(start, end + 1));
}

function sameIds(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((id, index) => id === second[index]);
}

function state(
  anchorId: string | null,
  focusId: string | null,
  stepIds: readonly string[],
): RangeSelectionState {
  return Object.freeze({
    anchorId,
    focusId,
    stepIds: Object.freeze([...stepIds]),
  });
}

export function reduceRangeSelection(
  current: RangeSelectionState,
  action: RangeSelectionAction,
  orderedStepIds: readonly string[],
): RangeSelectionState {
  switch (action.type) {
    case "click":
      return orderedStepIds.includes(action.stepId)
        ? state(action.stepId, action.stepId, [action.stepId])
        : current;
    case "extend": {
      if (!orderedStepIds.includes(action.stepId)) return current;
      const anchorId = current.anchorId ?? current.focusId ?? action.stepId;
      const stepIds = rangeBetween(orderedStepIds, anchorId, action.stepId);
      return stepIds.length > 0 ? state(anchorId, action.stepId, stepIds) : current;
    }
    case "marquee": {
      const selected = new Set(action.stepIds);
      const ordered = orderedStepIds.filter((id) => selected.has(id));
      if (ordered.length === 0) return EMPTY_RANGE_SELECTION;
      const firstId = ordered[0]!;
      const lastId = ordered[ordered.length - 1]!;
      return state(firstId, lastId, rangeBetween(orderedStepIds, firstId, lastId));
    }
    case "sync": {
      const anchorId =
        current.anchorId && orderedStepIds.includes(current.anchorId)
          ? current.anchorId
          : current.focusId && orderedStepIds.includes(current.focusId)
            ? current.focusId
            : null;
      const focusId =
        current.focusId && orderedStepIds.includes(current.focusId) ? current.focusId : anchorId;
      if (!anchorId || !focusId) return EMPTY_RANGE_SELECTION;
      const stepIds = rangeBetween(orderedStepIds, anchorId, focusId);
      if (
        sameIds(current.stepIds, stepIds) &&
        current.anchorId === anchorId &&
        current.focusId === focusId
      ) {
        return current;
      }
      return state(anchorId, focusId, stepIds);
    }
    case "clear":
      return EMPTY_RANGE_SELECTION;
  }
}

export function selectedRangeIds(
  stateValue: RangeSelectionState,
  orderedStepIds: readonly string[],
): readonly string[] {
  return reduceRangeSelection(stateValue, { type: "sync", orderedStepIds }, orderedStepIds).stepIds;
}
