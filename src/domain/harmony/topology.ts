import type { HarmonicFunctionIdentity } from "./functions";

export interface MatrixPosition {
  readonly column: number;
  readonly row: number;
}

export interface MatrixCardTopologyEntry {
  readonly identity: HarmonicFunctionIdentity;
  readonly layerId: string;
  readonly position: MatrixPosition;
  readonly baseline: boolean;
}

export interface MatrixRoute {
  readonly fromFunctionId: string;
  readonly toFunctionId: string;
  readonly via: readonly MatrixPosition[];
}

export interface MatrixTopologyDefinition {
  readonly cards: readonly MatrixCardTopologyEntry[];
  readonly routes: readonly MatrixRoute[];
}

export function manhattanRoute(
  from: MatrixPosition,
  to: MatrixPosition,
  bendColumn?: number,
): readonly MatrixPosition[] {
  const bend = bendColumn ?? to.column;
  const points: MatrixPosition[] = [from];
  if (from.column !== bend) points.push({ column: bend, row: from.row });
  if (from.row !== to.row) points.push({ column: bend, row: to.row });
  if (bend !== to.column) points.push(to);
  const compact = points.filter(
    (point, index) =>
      index === 0 ||
      point.column !== points[index - 1]!.column ||
      point.row !== points[index - 1]!.row,
  );
  return Object.freeze(compact.map((point) => Object.freeze({ ...point })));
}

/**
 * Adds contextual cards in a dedicated strip without ever moving baseline cards.
 * This is deliberately generic so future modules can use the same spatial-memory rule.
 */
export function expandedStripEntries(
  identities: readonly HarmonicFunctionIdentity[],
  layerId: string,
  row: number,
  startColumn = 0,
): readonly MatrixCardTopologyEntry[] {
  return Object.freeze(
    identities.map((identity, index) =>
      Object.freeze({
        identity,
        layerId,
        position: Object.freeze({ column: startColumn + index, row }),
        baseline: false,
      }),
    ),
  );
}
