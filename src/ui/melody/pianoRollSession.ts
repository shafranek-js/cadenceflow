import type { ExactPitch } from "../../domain/harmony/pitch";
import type { Rational } from "../../domain/timing/rational";

export interface PianoRollGestureDraft {
  readonly pointerId: number;
  readonly originX: number;
  readonly originY: number;
  readonly originGridYOffset: number;
  readonly initialPitchExpansion: number;
  readonly pitchRowHeight: number;
  readonly horizontalIntent: boolean;
  readonly verticalIntent: boolean;
  readonly baseline: string;
  readonly sourceStepId: string;
  readonly mode: "move" | "resize-left" | "resize-right";
  readonly grabOffset: Rational;
  readonly originalEnd: Rational;
  readonly originalNote: {
    readonly pitch: ExactPitch;
    readonly startBeats: Rational;
    readonly durationBeats: Rational;
  };
  readonly note: {
    readonly id: string;
    readonly pitch: ExactPitch;
    readonly startBeats: Rational;
    readonly durationBeats: Rational;
  };
}
export interface PianoRollClipboardNote {
  readonly pitch: ExactPitch;
  readonly onset: Rational;
  readonly duration: Rational;
}

let gesture: PianoRollGestureDraft | null = null;
let clipboard: readonly PianoRollClipboardNote[] = [];
const listeners = new Set<() => void>();

export function subscribePianoRollSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getPianoRollGesture(): PianoRollGestureDraft | null {
  return gesture;
}
export function setPianoRollGesture(value: PianoRollGestureDraft | null): void {
  gesture = value;
  listeners.forEach((listener) => listener());
}
export function setPianoRollClipboard(value: readonly PianoRollClipboardNote[]): void {
  clipboard = Object.freeze(value.map((note) => Object.freeze({ ...note })));
}
export function getPianoRollClipboard(): readonly PianoRollClipboardNote[] {
  return clipboard;
}
