import type { AudioClock, AudioNoteEvent, ScheduledPlayback } from "../../audio/contracts";
import type { KeyboardScheduledNote } from "../transport/transportStore";

export interface KeyboardPreviewSession {
  readonly owner: string;
  readonly order: number;
  readonly notes: readonly KeyboardScheduledNote[];
  readonly clock: AudioClock;
}

/** Holds the actual scheduled voices from independent preview controllers. */
export class KeyboardPreviewStore {
  private readonly sessions = new Map<string, KeyboardPreviewSession>();
  private order = 0;

  setScheduledPreview(
    owner: string,
    events: readonly AudioNoteEvent[],
    playback: ScheduledPlayback,
    clock: AudioClock,
  ): void {
    const scheduledAt = playback.scheduledAt ?? clock.now();
    const order = ++this.order;
    const notes = events
      .filter((event) => event.channelRole !== "metronome" && event.durationSeconds > 0)
      .map((event, index) => ({
        pitch: event.pitch,
        part: event.channelRole,
        start: scheduledAt + event.startSeconds,
        end: scheduledAt + event.startSeconds + event.durationSeconds,
        voiceId: `${owner}:${order}:${index}`,
      }));
    if (notes.length === 0) {
      this.clearPreview(owner);
      return;
    }
    this.sessions.set(owner, {
      owner,
      order,
      notes,
      clock,
    });
  }

  clearPreview(owner: string): void {
    this.sessions.delete(owner);
  }

  clearAll(): void {
    this.sessions.clear();
  }

  getSessions(): readonly KeyboardPreviewSession[] {
    return [...this.sessions.values()].sort((a, b) => a.order - b.order);
  }
}
