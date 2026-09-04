import { describe, expect, it } from "vitest";
import { SessionHistory } from "../../../src/app/history/history";

describe("SessionHistory", () => {
  it("clears redo after a new command", () => {
    const history = new SessionHistory();
    const a = { forward: { type: "a", payload: null }, inverse: { type: "undo-a", payload: null } };
    const b = { forward: { type: "b", payload: null }, inverse: { type: "undo-b", payload: null } };
    history.push(a);
    history.takeUndo();
    expect(history.canRedo).toBe(true);
    history.push(b);
    expect(history.canRedo).toBe(false);
  });
});
