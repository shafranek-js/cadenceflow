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
  #matrixSession: MatrixSessionState = Object.freeze({});
  #listeners = new Set<(change: AppStoreChange) => void>();
  readonly history = new SessionHistory();

  constructor(project: Project) {
    this.#project = project;
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
    const before = this.#project;
    const applied = handler(before, command);
    this.#project = applied.project;
    const persist = command.type !== "progression/select-step";
    if (persist) {
      this.history.push({ forward: applied.forward ?? command, inverse: applied.inverse });
    }
    this.#notify({ persist });
  }

  undo(): boolean {
    const entry = this.history.takeUndo();
    if (!entry) return false;
    this.#project = applyInverseCommand(this.#project, entry.inverse);
    this.#notify();
    return true;
  }

  redo(): boolean {
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
