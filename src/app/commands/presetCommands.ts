import type { Project } from "../../domain/project/project";
import type { FunctionalPreset, PresetApplyMode } from "../../domain/progression/presets";
import {
  applyPresetToProgression,
  saveCustomPresetFromProgression,
} from "../../domain/progression/presets";
import type { HarmonicContext } from "../../domain/harmony/modules/types";
import type { AppliedCommand, ProjectCommand } from "./index";

export interface SaveCustomPresetPayload {
  readonly name: string;
  readonly description?: string;
  readonly id?: string;
  readonly nowIso: string;
}

export type SaveCustomPresetCommand = ProjectCommand<SaveCustomPresetPayload> & {
  readonly type: "presets/save-custom";
};

export interface RestoreCustomPresetsPayload {
  readonly customPresets: readonly FunctionalPreset[];
  readonly nowIso: string;
}

export type RestoreCustomPresetsCommand = ProjectCommand<RestoreCustomPresetsPayload> & {
  readonly type: "presets/restore-custom";
};

export interface DeleteCustomPresetPayload {
  readonly presetId: string;
  readonly nowIso: string;
}

export type DeleteCustomPresetCommand = ProjectCommand<DeleteCustomPresetPayload> & {
  readonly type: "presets/delete-custom";
};

export interface ApplyPresetPayload {
  readonly preset: FunctionalPreset;
  readonly mode: PresetApplyMode;
  readonly nowIso: string;
}

export type ApplyPresetCommand = ProjectCommand<ApplyPresetPayload> & {
  readonly type: "presets/apply";
};

export function saveCustomPreset(
  project: Project,
  command: SaveCustomPresetCommand,
): AppliedCommand & { readonly preset: FunctionalPreset } {
  const options = {
    ...(command.payload.id !== undefined ? { id: command.payload.id } : {}),
    ...(command.payload.description !== undefined
      ? { description: command.payload.description }
      : {}),
  };
  const result = saveCustomPresetFromProgression(
    command.payload.name,
    project.progression,
    options,
  );

  if (result.kind === "unsupported-progression") {
    throw new Error(result.message);
  }

  const updatedCustomPresets = Object.freeze([...project.customPresets, result.preset]);

  return {
    preset: result.preset,
    project: Object.freeze({
      ...project,
      customPresets: updatedCustomPresets,
      updatedAt: command.payload.nowIso,
    }),
    inverse: {
      type: "presets/restore-custom",
      payload: {
        customPresets: project.customPresets,
        nowIso: command.payload.nowIso,
      },
    },
  };
}

export function restoreCustomPresets(
  project: Project,
  command: RestoreCustomPresetsCommand,
): AppliedCommand {
  return {
    project: Object.freeze({
      ...project,
      customPresets: Object.freeze([...command.payload.customPresets]),
      updatedAt: command.payload.nowIso,
    }),
    inverse: {
      type: "presets/restore-custom",
      payload: {
        customPresets: project.customPresets,
        nowIso: command.payload.nowIso,
      },
    },
  };
}

export function deleteCustomPreset(
  project: Project,
  command: DeleteCustomPresetCommand,
): AppliedCommand {
  const exists = project.customPresets.some((p) => p.id === command.payload.presetId);
  if (!exists) {
    throw new RangeError(`Unknown custom preset: ${command.payload.presetId}`);
  }

  const updatedCustomPresets = Object.freeze(
    project.customPresets.filter((p) => p.id !== command.payload.presetId),
  );

  return {
    project: Object.freeze({
      ...project,
      customPresets: updatedCustomPresets,
      updatedAt: command.payload.nowIso,
    }),
    inverse: {
      type: "presets/restore-custom",
      payload: {
        customPresets: project.customPresets,
        nowIso: command.payload.nowIso,
      },
    },
  };
}

export function applyPreset(project: Project, command: ApplyPresetCommand): AppliedCommand {
  const context: HarmonicContext = {
    tonic: project.tonic,
    moduleId: project.activeModule,
    mode: project.activeModule === "dark-harmony" ? "tonal-minor" : "major",
    spellingContext: {
      tonic: project.tonic,
      mode: project.activeModule === "dark-harmony" ? "tonal-minor" : "major",
    },
  };

  const nextProgression = applyPresetToProgression(
    project.progression,
    command.payload.preset,
    command.payload.mode,
    context,
    project.defaults,
  );

  return {
    project: Object.freeze({
      ...project,
      progression: nextProgression,
      updatedAt: command.payload.nowIso,
    }),
    inverse: {
      type: "progression/restore",
      payload: {
        progression: project.progression,
        nowIso: command.payload.nowIso,
      },
    },
  };
}
