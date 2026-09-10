import type { ProjectMetadata } from "../../persistence/projectRepository";
import { Icon } from "../common/Icon";

export interface ProjectTabsProps {
  readonly activeProjectId: string;
  readonly projects: readonly ProjectMetadata[];
  readonly activeProjectName: string;
  readonly busy?: boolean;
  readonly onOpenProject: (id: string) => void | Promise<void>;
  readonly onCloseProject: (id: string) => void | Promise<void>;
}

export function ProjectTabs({
  activeProjectId,
  projects,
  activeProjectName,
  busy = false,
  onOpenProject,
  onCloseProject,
}: ProjectTabsProps) {
  const tabs = projects.some((item) => item.id === activeProjectId)
    ? projects
    : [
        {
          id: activeProjectId,
          name: activeProjectName,
          createdAt: "",
          updatedAt: "",
          schemaVersion: 1,
        } satisfies ProjectMetadata,
        ...projects,
      ];

  return (
    <div className="project-tabs" role="tablist" aria-label="Open projects">
      {tabs.map((item) => {
        const isActive = item.id === activeProjectId;
        return (
          <div
            key={item.id}
            className={`project-tab-shell${isActive ? " is-active" : ""}`}
            role="presentation"
          >
            <button
              type="button"
              role="tab"
              className={`project-tab${isActive ? " is-active" : ""}`}
              aria-selected={isActive}
              aria-label={`${isActive ? "Active project" : "Open project"}: ${item.name}`}
              disabled={busy || isActive}
              data-testid={`project-tab-${item.id}`}
              onClick={() => {
                if (!isActive) void onOpenProject(item.id);
              }}
            >
              <span className="project-tab-title">{item.name}</span>
            </button>
            <button
              type="button"
              className="project-tab-close"
              aria-label={`Close project ${item.name}`}
              data-testid={`project-tab-close-${item.id}`}
              disabled={busy || tabs.length <= 1}
              title={tabs.length <= 1 ? "Keep at least one project open" : `Close ${item.name}`}
              onClick={(event) => {
                event.stopPropagation();
                if (!busy && tabs.length > 1) void onCloseProject(item.id);
              }}
            >
              <Icon name="close" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
