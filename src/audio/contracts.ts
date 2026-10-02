import type { Rational } from "../domain/timing/rational";

export type AudioProviderState = "idle" | "loading" | "ready" | "fallback" | "error";
export type AudioChannelRole = "upper" | "bass" | "melody" | "metronome";

export interface AudioNoteEvent {
  readonly pitch: number;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly velocity: number;
  readonly channelRole: AudioChannelRole;
  /** Effective Melody catalog id for melody events; absent on legacy generic events. */
  readonly instrument?: string | undefined;
  /** Stable identity retained for derived live events and exact UI highlighting. */
  readonly eventKey?: string | undefined;
  readonly sourceStepId?: string | undefined;
  readonly eventIndex?: number | undefined;
  readonly stepIndex?: number | undefined;
  readonly startBeats?: Rational | undefined;
  readonly durationBeats?: Rational | undefined;
}

export interface AudioClock {
  now(): number;
}

export interface PlaybackScope {
  readonly sessionId?: string | undefined;
  readonly stepIds?: readonly string[] | undefined;
}

export interface ScheduledPlayback {
  readonly id: string;
  /** Audio-clock time at which the provider scheduled the playback base. */
  readonly scheduledAt?: number | undefined;
  cancel(): void;
  readonly ready?: Promise<void> | undefined;
}

export interface InstrumentAudioProvider {
  readonly id: string;
  readonly state: AudioProviderState;
  prepare(): Promise<void>;
  schedule(events: readonly AudioNoteEvent[], clock: AudioClock): ScheduledPlayback;
  stop(scope?: PlaybackScope): void;
  dispose(): Promise<void>;
}
