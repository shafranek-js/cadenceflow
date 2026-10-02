import type {
  AudioClock,
  AudioNoteEvent,
  InstrumentAudioProvider,
  ScheduledPlayback,
} from "./contracts";
import { LookAheadScheduler } from "./scheduler";
import { realizeProgressionAudioEvents } from "./eventRealizer";
import { projectProgressionStepTimings } from "./eventRealizer";
import { realizeProgressionMelodyPerformance } from "./melodyPerformance";
import { generateCountInEvents, generateMetronomeBarEvents } from "./metronome";
import type { Meter } from "../domain/timing/meter";
import type { GrooveSettings } from "../domain/timing/swing";
import type { PitchClassIdentity } from "../domain/harmony/pitch";
import type { HarmonicContext } from "../domain/harmony/modules/types";
import type { ProgressionStep } from "../domain/progression/step";
import type { MelodyTrackSettings } from "../domain/melody/types";
import type { HarmonyTrackSettings } from "../domain/harmony/track";
import type { PlaybackClockSnapshot, TransportStore } from "../ui/transport/transportStore";
import type { LoopState } from "../ui/transport/loopState";
import { resolveLoopRegion } from "../ui/transport/loopState";
import { createProgressionMeasureLayout } from "../domain/timing/measureLayout";
import {
  addRational,
  rationalToNumber,
  subtractRational,
  ZERO,
  type Rational,
} from "../domain/timing/rational";

export interface PlaybackControllerOptions {
  readonly clock: AudioClock;
  readonly pianoProvider: InstrumentAudioProvider;
  readonly melodyProvider?: InstrumentAudioProvider | undefined;
  readonly metronomeProvider?: InstrumentAudioProvider | undefined;
  readonly onMelodyError?: ((error: unknown) => void) | undefined;
  readonly transportStore: TransportStore;
  readonly lookAheadHorizonSeconds?: number | undefined;
  readonly tickIntervalMs?: number | undefined;
}

export interface PlaybackSessionParams {
  readonly steps: readonly ProgressionStep[];
  readonly meter: Meter;
  readonly tempoBpm: number;
  readonly groove: GrooveSettings;
  readonly tonic: PitchClassIdentity;
  readonly context: HarmonicContext;
  readonly loopState?: LoopState | undefined;
  readonly metronomeEnabled?: boolean | undefined;
  readonly countInEnabled?: boolean | undefined;
  readonly startingStepIndex?: number | undefined;
  readonly harmonyTrack?: HarmonyTrackSettings | undefined;
  readonly melodyTrack?: MelodyTrackSettings | undefined;
  readonly mutedStepIds?: ReadonlySet<string> | undefined;
}

interface StepTimeBoundary {
  readonly stepIndex: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
}

interface MelodyTimeBoundary {
  readonly eventKey: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
}

export class PlaybackController {
  private readonly clock: AudioClock;
  private readonly pianoProvider: InstrumentAudioProvider;
  private readonly melodyProvider?: InstrumentAudioProvider | undefined;
  private readonly metronomeProvider?: InstrumentAudioProvider | undefined;
  private readonly onMelodyError?: ((error: unknown) => void) | undefined;
  private readonly transportStore: TransportStore;

  private scheduler: LookAheadScheduler | null = null;
  private activeSessionId: string | null = null;
  private currentParams: PlaybackSessionParams | null = null;
  private stepBoundaries: readonly StepTimeBoundary[] = [];
  private stepTrackingTimer: ReturnType<typeof setInterval> | null = null;
  private melodyTimeBoundaries: readonly MelodyTimeBoundary[] = [];
  private melodyAvailableForSession = false;

  private loopIteration = 0;
  private loopBaseAudioTime = 0;
  private loopDurationSeconds = 0;
  private loopDurationBeatsNumerator = 0;
  private loopDurationBeatsDenominator = 1;

  private readonly lookAheadHorizonSeconds?: number | undefined;
  private readonly tickIntervalMs?: number | undefined;

  constructor(options: PlaybackControllerOptions) {
    this.clock = options.clock;
    this.pianoProvider = options.pianoProvider;
    this.melodyProvider = options.melodyProvider;
    this.metronomeProvider = options.metronomeProvider;
    this.onMelodyError = options.onMelodyError;
    this.transportStore = options.transportStore;
    this.lookAheadHorizonSeconds = options.lookAheadHorizonSeconds;
    this.tickIntervalMs = options.tickIntervalMs;
  }

  get currentSessionId(): string | null {
    return this.activeSessionId;
  }

  get isPlaying(): boolean {
    return this.transportStore.getState().status === "playing";
  }

  get isPaused(): boolean {
    return this.transportStore.getState().status === "paused";
  }

  /**
   * Starts playback of the given progression from beginning or loop start.
   */
  start(params: PlaybackSessionParams): boolean {
    if (params.steps.length === 0) {
      this.transportStore.play({ stepCount: 0 });
      return false;
    }

    if (this.pianoProvider.state === "error") {
      this.transportStore.setError(`Audio provider error: ${this.pianoProvider.id}`);
      this.transportStore.stop();
      return false;
    }

    this.stopCurrentSession();

    let startingStepIndex = 0;
    const resolvedLoop = params.loopState
      ? resolveLoopRegion(params.loopState, params.steps)
      : null;
    if (resolvedLoop) {
      startingStepIndex = resolvedLoop.startStepIndex;
    }

    const started = this.transportStore.play({
      stepCount: params.steps.length,
      loopStartStepIndex: startingStepIndex,
    });
    if (!started) return false;

    this.activeSessionId = this.transportStore.getState().sessionId;
    this.currentParams = params;
    this.loopIteration = 0;

    return this.launchSessionPlayback(startingStepIndex, false);
  }

  /**
   * Starts playback from an exact step boundary.
   */
  playFromHere(stepTarget: string | number, params: PlaybackSessionParams): boolean {
    if (params.steps.length === 0) {
      this.transportStore.playFromHere({ stepTarget, stepCount: 0 });
      return false;
    }

    if (this.pianoProvider.state === "error") {
      this.transportStore.setError(`Audio provider error: ${this.pianoProvider.id}`);
      this.transportStore.stop();
      return false;
    }

    this.stopCurrentSession();

    const started = this.transportStore.playFromHere({
      stepTarget,
      stepCount: params.steps.length,
      stepIds: params.steps.map((s) => s.id),
    });
    if (!started) return false;

    this.activeSessionId = this.transportStore.getState().sessionId;
    this.currentParams = params;
    this.loopIteration = 0;

    const startingStepIndex = this.transportStore.getState().startingStepIndex;
    return this.launchSessionPlayback(startingStepIndex, false);
  }

  /**
   * Pauses playback, stops active sounding notes, and stores paused musical position.
   */
  pause(): void {
    if (!this.scheduler || this.transportStore.getState().status !== "playing") {
      return;
    }

    const pausedSeconds = this.scheduler.pause();
    const snapshot = this.transportStore.getState().playbackClockSnapshot;
    const audioNow = this.clock.now();
    const performanceNow = performance.now();
    const pausedSnapshot = snapshot
      ? Object.freeze({
          ...snapshot,
          state: "paused" as const,
          audioClockAnchorSeconds: audioNow,
          performanceClockAnchorMs: performanceNow,
          musicalPositionAnchorBeats: this.musicalPositionAtAudioTime(snapshot, audioNow),
        })
      : null;
    this.transportStore.pause(pausedSeconds, pausedSnapshot);
    this.clearStepTracking();
  }

  /**
   * Resumes playback from paused position without resetting to start.
   */
  resume(): boolean {
    if (!this.scheduler || this.transportStore.getState().status !== "paused") {
      return false;
    }

    const state = this.transportStore.getState();
    const snapshot = state.playbackClockSnapshot;
    this.scheduler.resume();
    const audioNow = this.clock.now();
    const performanceNow = performance.now();
    const resumeDelaySeconds = snapshot
      ? Math.max(0, snapshot.schedulerStartOffsetSeconds - (state.pausedPositionSeconds ?? 0))
      : 0;
    const resumedSnapshot: PlaybackClockSnapshot | null = snapshot
      ? Object.freeze({
          ...snapshot,
          state: "playing",
          audioClockAnchorSeconds: audioNow + resumeDelaySeconds,
          performanceClockAnchorMs: performanceNow + resumeDelaySeconds * 1000,
        })
      : null;
    this.transportStore.resume(resumedSnapshot);
    this.startStepTracking();
    return true;
  }

  /**
   * Stops playback immediately, resets play position, and clears active step.
   * Idempotent.
   */
  stop(): void {
    this.stopCurrentSession();
    this.transportStore.stop();
  }

  private stopCurrentSession(): void {
    this.clearStepTracking();
    if (this.scheduler) {
      this.scheduler.stop();
      this.scheduler.dispose();
      this.scheduler = null;
    }
    this.activeSessionId = null;
    this.currentParams = null;
    this.loopIteration = 0;
    this.loopBaseAudioTime = 0;
    this.melodyTimeBoundaries = [];
    this.melodyAvailableForSession = false;
  }

  private launchSessionPlayback(startingStepIndex: number, isLoopIteration: boolean): boolean {
    const params = this.currentParams;
    const sessionId = this.activeSessionId;
    if (!params || !sessionId) return false;

    const {
      steps,
      meter,
      tempoBpm,
      groove,
      tonic,
      context,
      loopState,
      metronomeEnabled,
      countInEnabled,
    } = params;

    const resolvedLoop = loopState ? resolveLoopRegion(loopState, steps) : null;

    // Determine range of steps to play
    let sliceStart = startingStepIndex;
    let sliceEnd = steps.length;

    if (resolvedLoop) {
      sliceStart = resolvedLoop.startStepIndex;
      sliceEnd = resolvedLoop.endStepIndex + 1;
      this.loopDurationBeatsNumerator = resolvedLoop.durationBeats.numerator;
      this.loopDurationBeatsDenominator = resolvedLoop.durationBeats.denominator;
      this.loopDurationSeconds =
        (this.loopDurationBeatsNumerator / this.loopDurationBeatsDenominator) * (60 / tempoBpm);
    }

    const activeSteps = steps.slice(sliceStart, sliceEnd);
    if (activeSteps.length === 0) {
      this.transportStore.onSessionEnded(sessionId);
      return false;
    }

    const secondsPerBeat = 60 / tempoBpm;
    const projectedTimings = projectProgressionStepTimings(steps, groove);

    const authoredStartBeats = steps
      .slice(0, sliceStart)
      .reduce<Rational>((sum, step) => addRational(sum, step.duration.beats), ZERO);
    const activeAuthoredDurationBeats = activeSteps.reduce<Rational>(
      (sum, step) => addRational(sum, step.duration.beats),
      ZERO,
    );
    const measureLayout = createProgressionMeasureLayout(steps, meter);
    const includesProjectEnd = sliceEnd === steps.length;
    const shouldIncludeTrailingGap =
      includesProjectEnd && (!resolvedLoop || resolvedLoop.endStepIndex === steps.length - 1);
    const playbackDurationBeats = shouldIncludeTrailingGap
      ? subtractRational(measureLayout.playbackDurationBeats, authoredStartBeats)
      : activeAuthoredDurationBeats;
    const playbackDurationSeconds = rationalToNumber(playbackDurationBeats) * secondsPerBeat;
    if (resolvedLoop) {
      this.loopDurationBeatsNumerator = playbackDurationBeats.numerator;
      this.loopDurationBeatsDenominator = playbackDurationBeats.denominator;
      this.loopDurationSeconds = playbackDurationSeconds;
    }

    // 1. Calculate Count-in (only for session start, never for resume or loop repetitions)
    const isFirstRun = !isLoopIteration && this.loopIteration === 0;
    const applyCountIn = isFirstRun && Boolean(countInEnabled);
    let countInDurationSeconds = 0;
    const countInEvents: AudioNoteEvent[] = [];

    if (applyCountIn) {
      const countIn = generateCountInEvents(meter, tempoBpm, 0);
      countInDurationSeconds = countIn.durationSeconds;
      countInEvents.push(...countIn.events);
    }

    if (!isLoopIteration) {
      this.loopIteration = 0;
      this.loopBaseAudioTime = this.clock.now() + countInDurationSeconds;
    }

    // 2. Realize the complete progression once, then filter/rebase the active
    // range. This preserves preceding voice-leading context for loops and
    // Play From Here without sounding prior steps.
    const sliceBaseBeats =
      projectedTimings.timings.get(sliceStart)?.startBeats ?? authoredStartBeats;
    const sliceBaseSeconds = rationalToNumber(sliceBaseBeats) * secondsPerBeat;
    const fullPianoEvents = realizeProgressionAudioEvents({
      steps,
      tonic,
      context,
      tempoBpm,
      groove,
    });
    const isSoundFontPiano = params.harmonyTrack?.pianoEngine === "soundfont";
    const sfPianoInst = params.harmonyTrack?.pianoSoundfontInstrument ?? "gm-000";
    const activePianoEvents = fullPianoEvents
      .filter(
        (event) =>
          event.stepIndex !== undefined &&
          event.stepIndex >= sliceStart &&
          event.stepIndex < sliceEnd,
      )
      .map((event) =>
        Object.freeze({
          ...event,
          startSeconds: countInDurationSeconds + event.startSeconds - sliceBaseSeconds,
          ...(isSoundFontPiano ? { instrument: sfPianoInst } : {}),
        }),
      );
    const melodyProjection = params.melodyTrack
      ? realizeProgressionMelodyPerformance({
          steps,
          tonic,
          context,
          tempoBpm,
          groove,
          melodyTrack: params.melodyTrack,
        })
      : null;
    const activeMelodyEvents =
      melodyProjection?.events
        .filter((event) => event.stepIndex >= sliceStart && event.stepIndex < sliceEnd)
        .map((event) =>
          Object.freeze({
            ...event,
            startSeconds: countInDurationSeconds + event.startSeconds - sliceBaseSeconds,
          }),
        ) ?? [];
    const harmonyEnabled = params.harmonyTrack?.muted !== true;
    const melodyEnabled = params.melodyTrack?.muted !== true;
    const harmonySolo = params.harmonyTrack?.solo === true;
    const melodySolo = params.melodyTrack?.solo === true;
    const hasSoloTrack = harmonySolo || melodySolo;
    const rawAudioEvents: AudioNoteEvent[] = [
      ...(harmonyEnabled && (!hasSoloTrack || harmonySolo) ? activePianoEvents : []),
      ...(melodyEnabled && (!hasSoloTrack || melodySolo) ? activeMelodyEvents : []),
    ];
    const audioEvents =
      params.mutedStepIds && params.mutedStepIds.size > 0
        ? rawAudioEvents.filter((event) => {
            if (event.sourceStepId) {
              return !params.mutedStepIds!.has(event.sourceStepId);
            }
            if (typeof event.stepIndex === "number") {
              const step = activeSteps[event.stepIndex - sliceStart];
              return !step || !params.mutedStepIds!.has(step.id);
            }
            return true;
          })
        : rawAudioEvents;
    const boundaries: StepTimeBoundary[] = [];

    for (let i = 0; i < activeSteps.length; i++) {
      const step = activeSteps[i]!;
      const actualStepIndex = sliceStart + i;
      const timing = projectedTimings.timings.get(actualStepIndex);
      if (!timing) throw new Error(`missing projected timing for step ${step.id}`);
      const stepStartSeconds =
        countInDurationSeconds +
        rationalToNumber(subtractRational(timing.startBeats, sliceBaseBeats)) * secondsPerBeat;
      const stepDurationSeconds = rationalToNumber(timing.durationBeats) * secondsPerBeat;
      const stepEndSeconds = stepStartSeconds + stepDurationSeconds;

      boundaries.push({
        stepIndex: actualStepIndex,
        startSeconds: stepStartSeconds,
        endSeconds: stepEndSeconds,
      });
    }

    this.melodyTimeBoundaries = activeMelodyEvents.map((event) => ({
      eventKey: event.eventKey,
      startSeconds: event.startSeconds,
      endSeconds: event.startSeconds + event.durationSeconds,
    }));
    this.melodyAvailableForSession =
      activeMelodyEvents.length > 0 &&
      Boolean(this.melodyProvider) &&
      (this.melodyProvider?.state === "ready" || this.melodyProvider?.state === "fallback");

    // 3. Add metronome clicks during playback if enabled
    if (metronomeEnabled) {
      const totalPlaybackSeconds = playbackDurationSeconds;
      const barDurationSec = ((meter.numerator * 4) / meter.denominator) * secondsPerBeat;
      const totalBars = Math.ceil(totalPlaybackSeconds / barDurationSec);

      for (let b = 0; b < totalBars; b++) {
        const barStartSec = countInDurationSeconds + b * barDurationSec;
        const barEvents = generateMetronomeBarEvents(meter, tempoBpm, barStartSec);
        audioEvents.push(...barEvents);
      }
    }

    // Combine count-in and progression events
    const allSessionEvents = [...countInEvents, ...audioEvents].sort(
      (a, b) => a.startSeconds - b.startSeconds || a.pitch - b.pitch,
    );

    this.stepBoundaries = boundaries;

    // Create composite provider if metronome clicks should route to metronomeProvider
    const activeProvider = this.createCompositeProvider();

    // Create and start scheduler
    try {
      this.scheduler = new LookAheadScheduler({
        clock: this.clock,
        provider: activeProvider,
        lookAheadHorizonSeconds: this.lookAheadHorizonSeconds,
        tickIntervalMs: this.tickIntervalMs,
        onPlaybackEnded: () => {
          if (this.activeSessionId !== sessionId) return;

          if (resolvedLoop && this.isPlaying) {
            // Loop: seamlessly advance to next iteration without cumulative drift
            this.loopIteration += 1;
            this.launchSessionPlayback(resolvedLoop.startStepIndex, true);
          } else {
            this.clearStepTracking();
            this.transportStore.onSessionEnded(sessionId);
          }
        },
        onError: (err) => {
          if (this.activeSessionId !== sessionId) return;
          this.clearStepTracking();
          this.transportStore.setError(String(err));
          this.transportStore.stop();
        },
      });

      const sessionStartAudioTime = isLoopIteration
        ? this.loopBaseAudioTime +
          (this.loopIteration * this.loopDurationBeatsNumerator * 60) /
            (this.loopDurationBeatsDenominator * tempoBpm)
        : this.loopBaseAudioTime - countInDurationSeconds;

      this.scheduler.start(
        allSessionEvents,
        sessionStartAudioTime,
        0,
        countInDurationSeconds + playbackDurationSeconds,
      );
      const playbackStartBeats = sliceBaseBeats;
      const playbackEndBeats = addRational(playbackStartBeats, playbackDurationBeats);
      const playbackAudioAnchor =
        sessionStartAudioTime + (isLoopIteration ? 0 : countInDurationSeconds);
      const anchorPerformanceNow = performance.now();
      const anchorAudioNow = this.clock.now();
      const playbackClockSnapshot: PlaybackClockSnapshot = Object.freeze({
        sessionId,
        state: "playing",
        audioClockAnchorSeconds: playbackAudioAnchor,
        performanceClockAnchorMs:
          anchorPerformanceNow + (playbackAudioAnchor - anchorAudioNow) * 1000,
        musicalPositionAnchorBeats: rationalToNumber(playbackStartBeats),
        startBeats: playbackStartBeats,
        endBeats: playbackEndBeats,
        tempoBpm,
        schedulerStartOffsetSeconds: isLoopIteration ? 0 : countInDurationSeconds,
        ...(resolvedLoop
          ? {
              loopStartBeats: resolvedLoop.startBeats,
              loopEndBeats: playbackEndBeats,
            }
          : {}),
      });
      this.transportStore.setPlaybackClockSnapshot(playbackClockSnapshot);
      this.startStepTracking();
      return true;
    } catch (err) {
      this.transportStore.setError(String(err));
      this.transportStore.stop();
      return false;
    }
  }

  private musicalPositionAtAudioTime(
    snapshot: PlaybackClockSnapshot,
    audioTimeSeconds: number,
  ): number {
    const elapsedSeconds = Math.max(0, audioTimeSeconds - snapshot.audioClockAnchorSeconds);
    let beat = snapshot.musicalPositionAnchorBeats + (elapsedSeconds * snapshot.tempoBpm) / 60;
    const loopStart = snapshot.loopStartBeats ? rationalToNumber(snapshot.loopStartBeats) : null;
    const loopEnd = snapshot.loopEndBeats ? rationalToNumber(snapshot.loopEndBeats) : null;
    if (loopStart !== null && loopEnd !== null && loopEnd > loopStart && beat >= loopEnd) {
      beat = loopStart + ((beat - loopStart) % (loopEnd - loopStart));
    }
    return Math.min(beat, rationalToNumber(snapshot.endBeats));
  }

  private createCompositeProvider(): InstrumentAudioProvider {
    const piano = this.pianoProvider;
    const melody = this.melodyProvider;
    const metronome = this.metronomeProvider;

    if (!metronome && !melody) {
      return piano;
    }

    return {
      id: "composite-playback-provider",
      state: piano.state,
      prepare: async () => {
        await Promise.all([piano.prepare?.(), metronome?.prepare?.()]);
      },
      schedule: (events, clock) => {
        const pianoEvents = events.filter(
          (e) => e.channelRole === "upper" || e.channelRole === "bass",
        );
        const melodyEvents = events.filter((e) => e.channelRole === "melody");
        const metronomeEvents = events.filter((e) => e.channelRole === "metronome");

        const handles: ScheduledPlayback[] = [];
        const readyPromises: Promise<void>[] = [];
        if (pianoEvents.length > 0) {
          const playback = piano.schedule(pianoEvents, clock);
          handles.push(playback);
          if (playback.ready) readyPromises.push(playback.ready);
        }
        if (
          melody &&
          melodyEvents.length > 0 &&
          (melody.state === "ready" || melody.state === "fallback")
        ) {
          try {
            const playback = melody.schedule(melodyEvents, clock);
            handles.push(playback);
            this.melodyAvailableForSession = true;
            if (playback.ready) {
              readyPromises.push(
                playback.ready.catch((error) => {
                  this.melodyAvailableForSession = false;
                  this.onMelodyError?.(error);
                }),
              );
            }
          } catch (error) {
            this.melodyAvailableForSession = false;
            this.transportStore.setActiveMelodyEventKey(null, this.activeSessionId ?? undefined);
            this.onMelodyError?.(error);
          }
        }
        if (metronomeEvents.length > 0) {
          if (metronome) {
            const playback = metronome.schedule(metronomeEvents, clock);
            handles.push(playback);
            if (playback.ready) readyPromises.push(playback.ready);
          }
        }

        return {
          id: `composite-batch-${Date.now()}`,
          cancel: () => {
            for (const h of handles) h.cancel();
          },
          ...(readyPromises.length > 0
            ? { ready: Promise.all(readyPromises).then(() => undefined) }
            : {}),
        };
      },
      stop: (scope) => {
        piano.stop(scope);
        melody?.stop(scope);
        metronome?.stop(scope);
      },
      dispose: async () => {
        await Promise.all([piano.dispose?.(), melody?.dispose?.(), metronome?.dispose?.()]);
      },
    };
  }

  private startStepTracking(): void {
    this.clearStepTracking();
    const sessionId = this.activeSessionId;

    this.stepTrackingTimer = setInterval(() => {
      if (!this.scheduler || !sessionId || this.activeSessionId !== sessionId || !this.isPlaying) {
        return;
      }

      // Check current elapsed musical seconds using non-invasive getter
      const currentMusicalSeconds = this.scheduler.getElapsedSeconds();

      let matchingStepIndex: number | null = null;
      let stepStartedAt: number | null = null;
      for (const boundary of this.stepBoundaries) {
        if (
          currentMusicalSeconds >= boundary.startSeconds &&
          currentMusicalSeconds < boundary.endSeconds
        ) {
          matchingStepIndex = boundary.stepIndex;
          const elapsedSec = Math.max(0, currentMusicalSeconds - boundary.startSeconds);
          stepStartedAt = performance.now() - elapsedSec * 1000;
          break;
        }
      }

      this.transportStore.setCurrentStepIndex(matchingStepIndex, sessionId, stepStartedAt);

      let activeMelodyEventKey: string | null = null;
      let melodyStartedAt: number | null = null;
      if (this.melodyAvailableForSession) {
        const melodyEvent = this.melodyTimeBoundaries.find(
          (boundary) =>
            currentMusicalSeconds >= boundary.startSeconds &&
            currentMusicalSeconds < boundary.endSeconds,
        );
        if (melodyEvent) {
          activeMelodyEventKey = melodyEvent.eventKey;
          const elapsedSec = Math.max(0, currentMusicalSeconds - melodyEvent.startSeconds);
          melodyStartedAt = performance.now() - elapsedSec * 1000;
        }
      }
      this.transportStore.setActiveMelodyEventKey(activeMelodyEventKey, sessionId, melodyStartedAt);
    }, 15);
  }

  private clearStepTracking(): void {
    if (this.stepTrackingTimer !== null) {
      clearInterval(this.stepTrackingTimer);
      this.stepTrackingTimer = null;
    }
    this.transportStore.setActiveMelodyEventKey(null, this.activeSessionId ?? undefined);
  }
}
