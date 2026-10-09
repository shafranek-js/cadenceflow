import type { ProjectCommand, ProjectCommandHandler } from "./commands";
import { applyInverseCommand } from "./commands/dispatcher";
import { SessionHistory } from "./history/history";
import type { Project } from "../domain/project/project";

export interface MatrixSessionState {
  readonly previewFunctionId?: string;
}

export interface AppStoreChange {
  readonly persist: boolean;
}

export class AppStore {
  #project: Project;
  #editingSuspended = false;
  #matrixSession: MatrixSessionState = Object.freeze({});
  #listeners = new Set<(change: AppStoreChange) => void>();
  readonly history = new SessionHistory();

  constructor(project: Project) {
    this.#project = project;
  }

  /** Identity transitions reject all commands, including MIDI and delayed callbacks. */
  setEditingSuspended(suspended: boolean): void {
    this.#editingSuspended = suspended;
  }

  get editingSuspended(): boolean {
    return this.#editingSuspended;
  }

  get project(): Project {
    return this.#project;
  }
  get matrixSession(): MatrixSessionState {
    return this.#matrixSession;
  }

  subscribe(listener: (change: AppStoreChange) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify(change: AppStoreChange = { persist: true }): void {
    for (const listener of this.#listeners) listener(change);
  }

  selectMatrixPreview(functionId: string): void {
    this.#matrixSession = Object.freeze({ previewFunctionId: functionId });
    this.#notify({ persist: false });
  }

  clearMatrixPreview(): void {
    this.#matrixSession = Object.freeze({});
    this.#notify({ persist: false });
  }

  dispatch<TCommand extends ProjectCommand>(
    command: TCommand,
    handler: ProjectCommandHandler<TCommand>,
  ): void {
    if (this.#editingSuspended) return;
    const before = this.#project;
    const applied = handler(before, command);
    if (applied.project === before) return;
    this.#project = applied.project;
    const recordHistory = command.type !== "progression/select-step";
    if (recordHistory) {
      this.history.push({ forward: applied.forward ?? command, inverse: applied.inverse });
    }
    this.#notify({ persist: true });
  }

  undo(): boolean {
    if (this.#editingSuspended) return false;
    const entry = this.history.takeUndo();
    if (!entry) return false;
    this.#project = applyInverseCommand(this.#project, entry.inverse);
    this.#notify();
    return true;
  }

  redo(): boolean {
    if (this.#editingSuspended) return false;
    const entry = this.history.takeRedo();
    if (!entry) return false;
    this.#project = applyInverseCommand(this.#project, entry.forward);
    this.#notify();
    return true;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  setProjectDefaults(defaults: Project["defaults"]): void {
    if (this.#editingSuspended) return;
    this.#project = Object.freeze({
      ...this.#project,
      defaults,
    });
    this.#notify();
  }

  replaceLoadedProject(project: Project): void {
    this.#project = project;
    this.history.clear();
    this.#matrixSession = Object.freeze({});
    this.#notify();
  }
}
