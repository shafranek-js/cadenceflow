import { musicalDuration } from "../timing/duration";
import { rational } from "../timing/rational";
import { globalTiming, meter } from "../timing/meter";
import { groove } from "../timing/swing";
import { emptyProgression } from "../progression/progression";
import type { StepPerformance } from "../progression/step";
import type { Project } from "./project";

export const DEFAULT_PIANO_PERFORMANCE: StepPerformance = Object.freeze({
  articulation: "humanized",
  register: "auto",
  voicingMode: "auto",
  bass: Object.freeze({ choice: "auto", octaveOffset: "auto" }),
  masterVelocity: 80,
  perNoteVelocityOverrides: Object.freeze({}),
  dynamicsViewPreference: "musical",
});

export function createDefaultProject(
  id: string,
  name = "Untitled",
  nowIso = new Date().toISOString(),
): Project {
  const defaults = Object.freeze({
    piano: Object.freeze({
      duration: musicalDuration(rational(4), { kind: "bars", bars: 1 }),
      performance: DEFAULT_PIANO_PERFORMANCE,
    }),
  });
  return Object.freeze({
    id,
    schemaVersion: 1,
    name,
    createdAt: nowIso,
    updatedAt: nowIso,
    activeModule: "progressions",
    tonic: 0,
    globalTiming: globalTiming(100, meter(4, 4, [4])),
    groove: groove("straight"),
    presentation: Object.freeze({
      expertiseMode: "composer",
      theme: "dark",
      globalMatrixCardView: "harmonic",
      showBassInStaff: false,
    }),
    defaults,
    moduleTemplateStates: Object.freeze({
      progressions: Object.freeze({ cards: Object.freeze({}) }),
      "dark-harmony": Object.freeze({ cards: Object.freeze({}) }),
    }),
    progression: emptyProgression(),
    customPresets: Object.freeze([]),
  });
}
