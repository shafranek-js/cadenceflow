import { describe, expect, it, vi } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import type { EffectiveMelodyNote } from "../../../src/domain/melody/effectiveTimeline";
import type { Project } from "../../../src/domain/project/project";
import { PianoRollTimelineCache } from "../../../src/ui/melody/pianoRollTimelineCache";

describe("PianoRollTimelineCache", () => {
  it("reuses the timeline when a Project snapshot changes only selection metadata", () => {
    const project = createDefaultProject("piano-roll-timeline-cache");
    const result: readonly EffectiveMelodyNote[] = Object.freeze([]);
    const build = vi.fn(() => result);
    const cache = new PianoRollTimelineCache(build);

    const initial = cache.get(project);
    const selected = Object.freeze({
      ...project,
      updatedAt: "2026-10-10T12:00:00.000Z",
      progression: Object.freeze({ ...project.progression, selectedStepId: "selected-step" }),
    });

    expect(cache.get(selected)).toBe(initial);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("rebuilds when each musical input used by the timeline changes", () => {
    const project = createDefaultProject("piano-roll-timeline-semantic-inputs");
    const semanticChanges: Project[] = [
      {
        ...project,
        progression: Object.freeze({
          ...project.progression,
          steps: Object.freeze([...project.progression.steps]),
        }),
      },
      { ...project, tonic: 1 },
      { ...project, activeModule: "dark-harmony" },
      { ...project, melodyTrack: Object.freeze({ ...project.melodyTrack, instrument: "gm-024" }) },
    ];

    for (const changed of semanticChanges) {
      const build = vi.fn(() => Object.freeze([]) as readonly EffectiveMelodyNote[]);
      const cache = new PianoRollTimelineCache(build);
      cache.get(project);
      cache.get(changed);
      expect(build).toHaveBeenCalledTimes(2);
    }
  });
});
