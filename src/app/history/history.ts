import type { ProjectCommand } from "../commands";

export interface HistoryEntry {
  readonly forward: ProjectCommand;
  readonly inverse: ProjectCommand;
}

/**
 * Default cap on retained undo entries.
 *
 * Each entry keeps the forward and inverse commands for one edit, and those commands close over
 * the payload of the change, so an unbounded stack grows for the whole session. A composing
 * session produces thousands of edits (every duration nudge, Matrix click and Melody edit is one),
 * and nobody undoes 5000 steps by hand.
 *
 * The bound is generous enough that it is never noticed in practice, and it applies only to the
 * oldest undo entries: redo is never truncated, so a long undo chain can always be walked back
 * forwards to exactly where the user was.
 */
export const DEFAULT_HISTORY_LIMIT = 1000;

export class SessionHistory {
  readonly #limit: number;
  #undo: HistoryEntry[] = [];
  #redo: HistoryEntry[] = [];

  constructor(limit: number = DEFAULT_HISTORY_LIMIT) {
    // Guard against a non-positive or non-integer cap, which would otherwise retain nothing or
    // behave unpredictably when compared against a length.
    this.#limit = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_HISTORY_LIMIT;
  }

  /** Maximum number of undo entries retained. */
  get limit(): number {
    return this.#limit;
  }

  push(entry: HistoryEntry): void {
    this.#undo.push(entry);
    if (this.#undo.length > this.#limit) {
      // Drop the oldest edit. `splice` on the front keeps the newest `limit` entries, which are
      // the ones a user can still reach; the discarded step simply becomes un-undoable.
      this.#undo.splice(0, this.#undo.length - this.#limit);
    }
    this.#redo = [];
  }

  takeUndo(): HistoryEntry | undefined {
    const entry = this.#undo.pop();
    if (entry) this.#redo.push(entry);
    return entry;
  }

  takeRedo(): HistoryEntry | undefined {
    const entry = this.#redo.pop();
    if (entry) this.#undo.push(entry);
    return entry;
  }

  clear(): void {
    this.#undo = [];
    this.#redo = [];
  }

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }
  get canRedo(): boolean {
    return this.#redo.length > 0;
  }
  get undoDepth(): number {
    return this.#undo.length;
  }
  get redoDepth(): number {
    return this.#redo.length;
  }
}
