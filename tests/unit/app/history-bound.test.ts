import { describe, expect, it } from "vitest";
import {
  DEFAULT_HISTORY_LIMIT,
  SessionHistory,
  type HistoryEntry,
} from "../../../src/app/history/history";

/**
 * The undo stack must not grow without bound.
 *
 * Each pushed entry retains the forward and inverse command for one edit, and those commands close
 * over the changed payload. A composing session issues thousands of edits — every duration nudge,
 * Matrix click and Melody edit is one — so an unbounded stack keeps every payload alive for the
 * whole session. The cap discards the *oldest* undo entries only; redo is never truncated, so a
 * long undo chain can still be walked forward again to exactly where the user was.
 */

function entry(label: string): HistoryEntry {
  return {
    forward: { type: `forward-${label}`, payload: null },
    inverse: { type: `inverse-${label}`, payload: null },
  };
}

describe("SessionHistory depth bound", () => {
  it("retains the newest entries and discards the oldest", () => {
    const history = new SessionHistory(3);
    for (const label of ["a", "b", "c", "d", "e"]) history.push(entry(label));

    expect(history.undoDepth).toBe(3);
    expect(history.limit).toBe(3);

    // Newest first: e, d, c. "a" and "b" were discarded.
    expect(history.takeUndo()?.forward.type).toBe("forward-e");
    expect(history.takeUndo()?.forward.type).toBe("forward-d");
    expect(history.takeUndo()?.forward.type).toBe("forward-c");
    expect(history.takeUndo()).toBeUndefined();
  });

  it("keeps exactly the limit without over-trimming", () => {
    const history = new SessionHistory(2);
    history.push(entry("a"));
    history.push(entry("b"));
    expect(history.undoDepth).toBe(2);
    // Pushing at the boundary must not drop anything yet.
    history.takeUndo();
    history.takeRedo();
    expect(history.undoDepth).toBe(2);
  });

  it("does not truncate redo, so an undone chain can still be walked forward", () => {
    const history = new SessionHistory(3);
    for (const label of ["a", "b", "c"]) history.push(entry(label));

    // Undo everything, then confirm each step is still redoable in order.
    expect(history.takeUndo()?.forward.type).toBe("forward-c");
    expect(history.takeUndo()?.forward.type).toBe("forward-b");
    expect(history.takeUndo()?.forward.type).toBe("forward-a");
    expect(history.redoDepth).toBe(3);
    expect(history.canUndo).toBe(false);

    expect(history.takeRedo()?.forward.type).toBe("forward-a");
    expect(history.takeRedo()?.forward.type).toBe("forward-b");
    expect(history.takeRedo()?.forward.type).toBe("forward-c");
    expect(history.undoDepth).toBe(3);
  });

  it("does not grow past the limit over a long session", () => {
    const history = new SessionHistory(50);
    for (let i = 0; i < 5000; i++) history.push(entry(String(i)));
    expect(history.undoDepth).toBe(50);
  });

  it("still clears redo when a new command arrives", () => {
    const history = new SessionHistory(5);
    history.push(entry("a"));
    history.takeUndo();
    expect(history.canRedo).toBe(true);
    history.push(entry("b"));
    expect(history.canRedo).toBe(false);
  });

  it("falls back to the default limit for an unusable cap", () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(new SessionHistory(bad).limit).toBe(DEFAULT_HISTORY_LIMIT);
    }
  });

  it("uses a default limit that a normal session cannot reach", () => {
    const history = new SessionHistory();
    expect(history.limit).toBe(DEFAULT_HISTORY_LIMIT);
    expect(DEFAULT_HISTORY_LIMIT).toBeGreaterThanOrEqual(100);
  });
});
