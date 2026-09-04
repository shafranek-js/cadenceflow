export type AudioProviderState = "idle" | "loading" | "ready" | "fallback" | "error";
export type AudioChannelRole = "upper" | "bass" | "metronome";

export interface AudioNoteEvent {
  readonly pitch: number;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly velocity: number;
  readonly channelRole: AudioChannelRole;
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
