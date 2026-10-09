import { describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { applyInverseCommand } from "../../../src/app/commands/dispatcher";
import {
  setIndependentBassEnabled,
  type SetIndependentBassCommand,
} from "../../../src/app/commands/projectCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";

describe("independent bass voice setting", () => {
  const nowIso = "2026-10-08T12:00:00.000Z";

  it("defaults off and records one reversible project command per real toggle", () => {
    const initial = createDefaultProject("independent-bass", "Independent Bass", nowIso);
    const store = new AppStore(initial);
    const command: SetIndependentBassCommand = {
      type: "project/set-independent-bass-enabled",
      payload: { enabled: true, nowIso },
    };

    expect(initial.independentBassEnabled).toBe(false);
    store.dispatch(command, setIndependentBassEnabled);
    expect(store.project.independentBassEnabled).toBe(true);
    expect(store.project.progression).toBe(initial.progression);
    expect(store.history.undoDepth).toBe(1);

    store.dispatch(command, setIndependentBassEnabled);
    expect(store.history.undoDepth).toBe(1);
    expect(store.undo()).toBe(true);
    expect(store.project.independentBassEnabled).toBe(false);
    expect(store.redo()).toBe(true);
    expect(store.project.independentBassEnabled).toBe(true);
  });

  it("applies the inverse without changing retained Step bass settings", () => {
    const enabledProject = Object.freeze({
      ...createDefaultProject("independent-bass-inverse", "Independent Bass", nowIso),
      independentBassEnabled: true,
    });
    const applied = setIndependentBassEnabled(enabledProject, {
      type: "project/set-independent-bass-enabled",
      payload: { enabled: false, nowIso },
    });

    expect(applied.project.independentBassEnabled).toBe(false);
    expect(applyInverseCommand(applied.project, applied.inverse).independentBassEnabled).toBe(true);
    expect(applied.project.progression).toBe(enabledProject.progression);
  });
});
