import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { exactPitch } from "../../../src/domain/harmony/pitch";
import { rational, rationalToNumber } from "../../../src/domain/timing/rational";
import { AppStore } from "../../../src/app/appStore";
import { splitSystemStep, tieSystemSteps } from "../../../src/app/commands/systemChordCommands";
import { getHarmonicModule } from "../../../src/domain/harmony/moduleRegistry";
import { realizeProgressionAudioEvents } from "../../../src/audio/eventRealizer";
import { realizeProgressionMelodyPerformance } from "../../../src/audio/melodyPerformance";
import { realizePianoRollChordAudition } from "../../../src/audio/pianoRollAudition";
import { PreviewAuditionController } from "../../../src/audio/previewAudition";
import { PlaybackController } from "../../../src/audio/playbackController";
import { TransportStore } from "../../../src/ui/transport/transportStore";
import type { AudioNoteEvent, InstrumentAudioProvider } from "../../../src/audio/contracts";
import type { Project } from "../../../src/domain/project/project";
import { createPianoRollSystemChordFixture } from "../../fixtures/piano-roll-system-chord.fixture";

function realizedProjectAudio(project: ReturnType<typeof createPianoRollSystemChordFixture>) {
  const mode = getHarmonicModule(project.activeModule).mode;
  const context = {
    tonic: project.tonic,
    mode,
    moduleId: project.activeModule,
    spellingContext: { tonic: project.tonic, mode },
  };
  const harmony = realizeProgressionAudioEvents({
    steps: project.progression.steps,
    tonic: project.tonic,
    context,
    tempoBpm: project.globalTiming.tempoBpm,
    groove: project.groove,
  });
  const melody = realizeProgressionMelodyPerformance({
    steps: project.progression.steps,
    tonic: project.tonic,
    context,
    tempoBpm: project.globalTiming.tempoBpm,
    groove: project.groove,
    melodyTrack: project.melodyTrack,
  });
  const secondsPerBeat = 60 / project.globalTiming.tempoBpm;
  return {
    harmony: harmony.map((event) => ({
      pitch: event.pitch,
      beat: event.startSeconds / secondsPerBeat,
      role: event.channelRole,
    })),
    melody: melody.events.map((event) => ({
      pitch: event.pitch,
      start: event.startBeats,
      duration: event.durationBeats,
    })),
  };
}

function scheduleProjectThroughPlaybackController(project: Project) {
  const harmonyEvents: AudioNoteEvent[] = [];
  const melodyEvents: AudioNoteEvent[] = [];
  const captureProvider = (id: string, target: AudioNoteEvent[]): InstrumentAudioProvider => ({
    id,
    state: "ready",
    prepare: async () => {},
    schedule: (events) => {
      target.push(...events);
      return { id: `${id}-batch`, cancel: () => {} };
    },
    stop: () => {},
    dispose: async () => {},
  });
  const clock = { now: () => 0 };
  const controller = new PlaybackController({
    clock,
    pianoProvider: captureProvider("harmony-capture", harmonyEvents),
    melodyProvider: captureProvider("melody-capture", melodyEvents),
    transportStore: new TransportStore(),
    lookAheadHorizonSeconds: 60,
  });
  const mode = getHarmonicModule(project.activeModule).mode;
  const context = {
    tonic: project.tonic,
    mode,
    moduleId: project.activeModule,
    spellingContext: { tonic: project.tonic, mode },
  };
  const started = controller.start({
    steps: project.progression.steps,
    meter: project.globalTiming.meter,
    tempoBpm: project.globalTiming.tempoBpm,
    groove: project.groove,
    tonic: project.tonic,
    context,
    harmonyTrack: project.harmonyTrack,
    melodyTrack: project.melodyTrack,
  });

  if (!started) throw new Error("PlaybackController did not start the fixture project");

  return {
    harmonyEvents,
    melodyEvents,
    stop: () => controller.stop(),
  };
}

function melodyPerformanceSignature(events: readonly AudioNoteEvent[]) {
  return events
    .map((event) => [event.pitch, event.startSeconds, event.durationSeconds])
    .sort((left, right) => left[1]! - right[1]! || left[0]! - right[0]! || left[2]! - right[2]!);
}

describe("Piano Roll chord audition", () => {
  it("realizes one effective Harmony interval and excludes crossing Melody notes", () => {
    const base = createDefaultProject("piano-roll-chord-preview", "Chord preview");
    const first = createMatrixChordStep(base, "I", "tonic");
    const second = createMatrixChordStep(base, "V", "dominant");
    const project = {
      ...base,
      progression: {
        ...base.progression,
        steps: [
          {
            ...first,
            melody: {
              mode: "authored" as const,
              phrase: {
                notes: [
                  {
                    id: "cross-boundary-melody",
                    pitch: exactPitch(111, { step: "D", alter: 1 }),
                    onset: rational(7, 2),
                    duration: rational(2),
                  },
                ],
              },
            },
          },
          second,
        ],
      },
    };

    const preview = realizePianoRollChordAudition(project, "tonic");
    expect(preview).not.toBeNull();
    expect(preview).toMatchObject({ stepIndex: 0, startBeat: 0, endBeat: 4 });
    expect(preview!.events.length).toBeGreaterThan(0);
    expect(preview!.events.every((event) => event.startSeconds >= 0)).toBe(true);
    expect(
      preview!.events.every(
        (event) => event.durationSeconds <= 4 * (60 / project.globalTiming.tempoBpm),
      ),
    ).toBe(true);
    expect(preview!.events.some((event) => event.pitch === 111)).toBe(false);
    expect(realizePianoRollChordAudition(project, "missing")).toBeNull();

    const scheduledEvents: import("../../../src/audio/contracts").AudioNoteEvent[][] = [];
    const clock = { now: () => 18.75 };
    const engine = new PreviewAuditionController({
      clock,
      provider: {
        id: "piano-roll-instrumented-engine",
        state: "ready",
        prepare: async () => {},
        schedule: (events) => {
          scheduledEvents.push([...events]);
          return { id: "chord-only", scheduledAt: clock.now(), cancel: () => {} };
        },
        stop: () => {},
        dispose: async () => {},
      },
    });
    const actualPlayback = engine.audition(preview!.events);
    expect(actualPlayback?.scheduledAt).toBe(18.75);
    expect(scheduledEvents).toHaveLength(1);
    expect(scheduledEvents[0]).toEqual(preview!.events);
    expect(scheduledEvents[0]!.some((event) => event.pitch === 111)).toBe(false);
  });

  it("schedules a Harmony attack at Split without introducing a Melody attack", () => {
    const source = createPianoRollSystemChordFixture();
    const before = realizedProjectAudio(source);
    const beforePlayback = scheduleProjectThroughPlaybackController(source);
    const store = new AppStore(source);
    store.dispatch(
      {
        type: "piano-roll/split-step",
        payload: {
          stepId: "chord-a",
          newStepId: "split-second",
          nowIso: "2026-10-02T12:01:00.000Z",
        },
      },
      splitSystemStep,
    );
    const after = realizedProjectAudio(store.project);
    const afterPlayback = scheduleProjectThroughPlaybackController(store.project);
    const splitStartSeconds = 2 * (60 / source.globalTiming.tempoBpm);
    const harmonyAttacksAtSplit = after.harmony.filter((event) => Math.abs(event.beat - 2) < 1e-8);
    const scheduledHarmonyAttacksAtSplit = afterPlayback.harmonyEvents.filter(
      (event) => Math.abs(event.startSeconds - splitStartSeconds) < 1e-8,
    );

    expect(harmonyAttacksAtSplit.length).toBeGreaterThan(0);
    expect(scheduledHarmonyAttacksAtSplit.length).toBeGreaterThan(0);
    expect(after.melody.some((event) => Math.abs(rationalToNumber(event.start) - 2) < 1e-8)).toBe(
      false,
    );
    expect(after.melody).toEqual(before.melody);
    expect(
      afterPlayback.melodyEvents.some(
        (event) => Math.abs(event.startSeconds - splitStartSeconds) < 1e-8,
      ),
    ).toBe(false);
    expect(melodyPerformanceSignature(afterPlayback.melodyEvents)).toEqual(
      melodyPerformanceSignature(beforePlayback.melodyEvents),
    );
    beforePlayback.stop();
    afterPlayback.stop();
  });

  it("schedules no internal Harmony reattack after Tie and preserves Melody onsets", () => {
    const source = createPianoRollSystemChordFixture();
    const before = realizedProjectAudio(source);
    const beforePlayback = scheduleProjectThroughPlaybackController(source);
    const store = new AppStore(source);
    store.dispatch(
      {
        type: "piano-roll/tie-steps",
        payload: {
          stepIds: ["chord-a", "chord-b"],
          nowIso: "2026-10-02T12:01:00.000Z",
        },
      },
      tieSystemSteps,
    );
    const after = realizedProjectAudio(store.project);
    const afterPlayback = scheduleProjectThroughPlaybackController(store.project);
    const tieBoundarySeconds = 4 * (60 / source.globalTiming.tempoBpm);

    expect(before.harmony.some((event) => Math.abs(event.beat - 4) < 1e-8)).toBe(true);
    expect(after.harmony.some((event) => Math.abs(event.beat - 4) < 1e-8)).toBe(false);
    expect(after.melody).toEqual(before.melody);
    expect(
      beforePlayback.harmonyEvents.some(
        (event) => Math.abs(event.startSeconds - tieBoundarySeconds) < 1e-8,
      ),
    ).toBe(true);
    expect(
      afterPlayback.harmonyEvents.some(
        (event) => Math.abs(event.startSeconds - tieBoundarySeconds) < 1e-8,
      ),
    ).toBe(false);
    expect(melodyPerformanceSignature(afterPlayback.melodyEvents)).toEqual(
      melodyPerformanceSignature(beforePlayback.melodyEvents),
    );
    beforePlayback.stop();
    afterPlayback.stop();
  });
});
