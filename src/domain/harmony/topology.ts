import type { HarmonicFunctionIdentity, MatrixMixPolicy } from "./functions";

export const MATRIX_PRIMARY_COLUMN_COUNT = 6;

export type MatrixPole = "dominant" | "subdominant";

export interface MatrixPosition {
  readonly column: number;
  readonly row: number;
}

export interface MatrixCardTopologyEntry {
  readonly identity: HarmonicFunctionIdentity;
  readonly layerId: string;
  readonly position: MatrixPosition;
  readonly baseline: boolean;
  readonly mixPolicy: MatrixMixPolicy;
  readonly targetId?: string;
  readonly bassScaleDegree?: number;
  readonly pole?: MatrixPole;
  readonly aliases?: readonly string[];
  readonly auxiliary?: boolean;
}

export interface MatrixRoute {
  readonly fromFunctionId: string;
  readonly toFunctionId: string;
  readonly via: readonly MatrixPosition[];
}

export interface MatrixTopologyDefinition {
  readonly columnCount: typeof MATRIX_PRIMARY_COLUMN_COUNT;
  readonly columnLabels: readonly string[];
  readonly cards: readonly MatrixCardTopologyEntry[];
  readonly routes: readonly MatrixRoute[];
}

export interface DiminishedAliasGroup {
  readonly id: string;
  readonly canonicalId: string;
  readonly aliases: readonly string[];
}

/**
 * Diminished spellings/inversion labels are aliases of one harmonic entity.
 * Keeping the canonical id stable prevents the Matrix from rendering one
 * harmonic identity once per enharmonic/inversion spelling.
 */
export function getDiminishedAliasGroup(functionId: string): DiminishedAliasGroup | undefined {
  const match = functionId.match(/^(?:vii°7|vii°|viio7|viio)\/(.+)$/);
  if (!match?.[1]) return undefined;
  const targetId = match[1];
  const canonicalId = `vii°7/${targetId}`;
  return Object.freeze({
    id: `diminished:${targetId}`,
    canonicalId,
    aliases: Object.freeze([
      canonicalId,
      `vii°/${targetId}`,
      `viio7/${targetId}`,
      `viio/${targetId}`,
    ]),
  });
}

export function canonicalDiminishedFunctionId(functionId: string): string {
  return getDiminishedAliasGroup(functionId)?.canonicalId ?? functionId;
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
        mixPolicy: identity.targetId || identity.targetFunctionId ? "must-resolve" : "mix-freely",
        ...(identity.targetId || identity.targetFunctionId
          ? { targetId: identity.targetId ?? identity.targetFunctionId }
          : {}),
      }),
    ),
  );
}
