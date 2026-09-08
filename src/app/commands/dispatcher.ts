import type { Project } from "../../domain/project/project";
import type { ProjectCommand } from "./index";
import {
  setTempo,
  setGroove,
  setStepDuration,
  restoreMeterAndSteps,
  type SetTempoCommand,
  type SetGrooveCommand,
  type SetStepDurationCommand,
  type RestoreMeterAndStepsCommand,
} from "./timingCommands";
import { restoreProgression, type RestoreProgressionCommand } from "./progressionCommands";
import { restoreBranchState, type RestoreBranchStateCommand } from "./branchCommands";
import {
  restoreModuleTemplate,
  restoreAllTemplates,
  type RestoreModuleTemplateCommand,
  type RestoreAllTemplateCommand,
} from "./matrixTemplateCommands";
import {
  setGlobalCardView,
  setCardViewOverride,
  type SetGlobalCardViewCommand,
  type SetCardViewOverrideCommand,
} from "./matrixViewCommands";
import { setTonic, type SetTonicCommand } from "./harmonyContextCommands";
import { restoreCustomPresets, type RestoreCustomPresetsCommand } from "./presetCommands";
import { renameProject, type RenameProjectCommand } from "./projectCommands";
import {
  setTheme,
  setExpertiseMode,
  type SetThemeCommand,
  type SetExpertiseModeCommand,
} from "./presentationCommands";

export function applyInverseCommand(project: Project, command: ProjectCommand): Project {
  switch (command.type) {
    case "timing/restore-meter-and-steps":
      return restoreMeterAndSteps(project, command as RestoreMeterAndStepsCommand).project;
    case "timing/set-tempo":
      return setTempo(project, command as SetTempoCommand).project;
    case "timing/set-groove":
      return setGroove(project, command as SetGrooveCommand).project;
    case "timing/set-step-duration":
      return setStepDuration(project, command as SetStepDurationCommand).project;
    case "progression/restore":
      return restoreProgression(project, command as RestoreProgressionCommand).project;
    case "presets/restore-custom":
      return restoreCustomPresets(project, command as RestoreCustomPresetsCommand).project;
    case "branch/restore-state":
      return restoreBranchState(project, command as RestoreBranchStateCommand).project;
    case "matrix-template/restore-module":
      return restoreModuleTemplate(project, command as RestoreModuleTemplateCommand).project;
    case "matrix-template/restore-all":
      return restoreAllTemplates(project, command as RestoreAllTemplateCommand).project;
    case "matrix/set-global-card-view":
      return setGlobalCardView(project, command as SetGlobalCardViewCommand).project;
    case "matrix/set-card-view-override":
      return setCardViewOverride(project, command as SetCardViewOverrideCommand).project;
    case "harmony/set-tonic":
      return setTonic(project, command as SetTonicCommand).project;
    case "project/rename":
      return renameProject(project, command as RenameProjectCommand).project;
    case "presentation/set-theme":
      return setTheme(project, command as SetThemeCommand).project;
    case "presentation/set-expertise-mode":
      return setExpertiseMode(project, command as SetExpertiseModeCommand).project;
    default:
      return project;
  }
}
