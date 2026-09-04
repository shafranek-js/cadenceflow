import type { ProjectCommand } from "../commands";

export interface HistoryEntry {
  readonly forward: ProjectCommand;
  readonly inverse: ProjectCommand;
}

export class SessionHistory {
  #undo: HistoryEntry[] = [];
  #redo: HistoryEntry[] = [];

  push(entry: HistoryEntry): void {
    this.#undo.push(entry);
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
