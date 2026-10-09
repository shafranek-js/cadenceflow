import { describe, expect, it, vi } from "vitest";
import {
  AcousticGuitarProvider,
  type GuitarSampleNode,
  type GuitarInstrumentLoader,
  type GuitarSamplePlayer,
} from "../../../../src/audio/guitar/AcousticGuitarProvider";
import {
  guitarStrumOffsetSeconds,
  GUITAR_STRUM_SPREAD_SECONDS,
} from "../../../../src/audio/guitar/strumTiming";
import type { AudioNoteEvent } from "../../../../src/audio/contracts";

function createMockPlayer() {
  return {
    play: vi.fn<GuitarSamplePlayer["play"]>(() => ({ stop: vi.fn<GuitarSampleNode["stop"]>() })),
    stop: vi.fn<GuitarSamplePlayer["stop"]>(),
  };
}

function createMockContext(): AudioContext {
  return {
    currentTime: 10,
    destination: {} as AudioNode,
  } as AudioContext;
}

describe("AcousticGuitarProvider (Sample-Backed)", () => {
  it("prepares instrument soundbank and manages state transitions", async () => {
    const stateTransitions: string[] = [];
    const player = createMockPlayer();
    const loader = vi.fn<GuitarInstrumentLoader>(async () => player);

    const provider = new AcousticGuitarProvider({
      audioContext: createMockContext(),
      loadInstrument: loader,
      assetUrl: "/audio/guitar/acoustic_guitar_steel-mp3.js",
      onStateChange: (s) => stateTransitions.push(s),
    });

    expect(provider.state).toBe("idle");
    await provider.prepare();

    expect(provider.state).toBe("ready");
    expect(stateTransitions).toEqual(["loading", "ready"]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader.mock.calls[0]?.[1]).toBe("acoustic_guitar_steel");
    expect(loader.mock.calls[0]?.[2]).toBe("/audio/guitar/acoustic_guitar_steel-mp3.js");
  });

  it("schedules six-string chords across a 30ms total spread from low to high", async () => {
    const player = createMockPlayer();
    const loader = vi.fn<GuitarInstrumentLoader>(async () => player);
    const mockCtx = createMockContext();

    const provider = new AcousticGuitarProvider({
      audioContext: mockCtx,
      loadInstrument: loader,
      volume: 100,
    });
    await provider.prepare();

    // Simultaneous chord notes passed in non-sorted order.
    const chordEvents: AudioNoteEvent[] = [
      { pitch: 64, startSeconds: 0.5, durationSeconds: 1.5, velocity: 90, channelRole: "upper" },
      { pitch: 40, startSeconds: 0.5, durationSeconds: 1.5, velocity: 90, channelRole: "upper" },
      { pitch: 47, startSeconds: 0.5, durationSeconds: 1.5, velocity: 90, channelRole: "upper" },
      { pitch: 52, startSeconds: 0.5, durationSeconds: 1.5, velocity: 90, channelRole: "upper" },
      { pitch: 55, startSeconds: 0.5, durationSeconds: 1.5, velocity: 90, channelRole: "upper" },
      { pitch: 59, startSeconds: 0.5, durationSeconds: 1.5, velocity: 90, channelRole: "upper" },
    ];

    const playback = provider.schedule(chordEvents, { now: () => 10 });
    expect(playback.id).toMatch(/^guitar-live-/);

    // Should play all six strings sorted ascending by pitch.
    expect(player.play).toHaveBeenCalledTimes(6);

    const call1 = player.play.mock.calls[0]!;
    const call2 = player.play.mock.calls[1]!;
    const call3 = player.play.mock.calls[2]!;
    const call4 = player.play.mock.calls[3]!;
    const call5 = player.play.mock.calls[4]!;
    const call6 = player.play.mock.calls[5]!;

    expect(call1[0]).toBe(40); // lowest note: string delay 0
    expect(call1[1]).toBeCloseTo(10.5, 4);
    expect(call2[0]).toBe(47);
    expect(call3[0]).toBe(52);
    expect(call4[0]).toBe(55);
    expect(call5[0]).toBe(59);
    expect(call6[0]).toBe(64); // highest note
    expect(call6[1]! - call1[1]!).toBeCloseTo(GUITAR_STRUM_SPREAD_SECONDS, 4);
    expect(call6[1]! - call5[1]!).toBeCloseTo(GUITAR_STRUM_SPREAD_SECONDS / 5, 4);
  });

  it("preserves an explicit adjacent-string delay override", async () => {
    const player = createMockPlayer();
    const provider = new AcousticGuitarProvider({
      audioContext: createMockContext(),
      loadInstrument: vi.fn<GuitarInstrumentLoader>(async () => player),
      strumDelaySeconds: 0.015,
    });
    await provider.prepare();

    provider.schedule(
      [40, 47, 52].map((pitch) => ({
        pitch,
        startSeconds: 0.5,
        durationSeconds: 1,
        velocity: 90,
        channelRole: "upper" as const,
      })),
      { now: () => 10 },
    );

    expect(player.play.mock.calls[2]![1]! - player.play.mock.calls[0]![1]!).toBeCloseTo(0.03, 4);
  });

  it("does not add a second spread to already-spread progression events", async () => {
    const player = createMockPlayer();
    const provider = new AcousticGuitarProvider({
      audioContext: createMockContext(),
      loadInstrument: vi.fn<GuitarInstrumentLoader>(async () => player),
    });
    await provider.prepare();

    const progressionEvents: AudioNoteEvent[] = [40, 45, 50, 55, 59, 64].map((pitch, index) => ({
      pitch,
      startSeconds: guitarStrumOffsetSeconds(index, 6),
      durationSeconds: 1,
      velocity: 90,
      channelRole: "upper",
    }));
    provider.schedule(progressionEvents, { now: () => 10 });

    expect(player.play).toHaveBeenCalledTimes(6);
    expect(player.play.mock.calls[5]![1]! - player.play.mock.calls[0]![1]!).toBeCloseTo(
      GUITAR_STRUM_SPREAD_SECONDS,
      4,
    );
    for (let index = 0; index < progressionEvents.length; index++) {
      expect(player.play.mock.calls[index]![1]).toBeCloseTo(
        10 + progressionEvents[index]!.startSeconds,
        4,
      );
    }
  });

  it("returns zero spread for zero or one string", () => {
    expect(guitarStrumOffsetSeconds(0, 0)).toBe(0);
    expect(guitarStrumOffsetSeconds(0, 1)).toBe(0);
  });

  it("schedules melodic scale notes at exact start times without strum offset", async () => {
    const player = createMockPlayer();
    const loader = vi.fn<GuitarInstrumentLoader>(async () => player);

    const provider = new AcousticGuitarProvider({
      audioContext: createMockContext(),
      loadInstrument: loader,
    });
    await provider.prepare();

    const scaleEvents: AudioNoteEvent[] = [
      { pitch: 60, startSeconds: 0.0, durationSeconds: 0.24, velocity: 80, channelRole: "upper" },
      { pitch: 62, startSeconds: 0.24, durationSeconds: 0.24, velocity: 80, channelRole: "upper" },
      { pitch: 64, startSeconds: 0.48, durationSeconds: 0.24, velocity: 80, channelRole: "upper" },
    ];

    provider.schedulePreview(scaleEvents, { now: () => 10 });

    expect(player.play).toHaveBeenCalledTimes(3);
    expect(player.play.mock.calls[0]![0]).toBe(60);
    expect(player.play.mock.calls[0]![1]).toBeCloseTo(10.0, 4);

    expect(player.play.mock.calls[1]![0]).toBe(62);
    expect(player.play.mock.calls[1]![1]).toBeCloseTo(10.24, 4);

    expect(player.play.mock.calls[2]![0]).toBe(64);
    expect(player.play.mock.calls[2]![1]).toBeCloseTo(10.48, 4);
  });

  it("cancels active playbacks when cancel() is invoked", async () => {
    const mockNode: GuitarSampleNode = { stop: vi.fn() };
    const player = {
      play: vi.fn(() => mockNode),
      stop: vi.fn(),
    };
    const provider = new AcousticGuitarProvider({
      audioContext: createMockContext(),
      loadInstrument: vi.fn<GuitarInstrumentLoader>(async () => player),
    });
    await provider.prepare();

    const playback = provider.schedule(
      [{ pitch: 45, startSeconds: 0, durationSeconds: 1.0, velocity: 80, channelRole: "upper" }],
      { now: () => 10 },
    );

    playback.cancel();
    expect(mockNode.stop).toHaveBeenCalledTimes(1);
  });

  it("sets state to error when soundbank loading fails", async () => {
    const stateTransitions: string[] = [];
    const provider = new AcousticGuitarProvider({
      audioContext: createMockContext(),
      loadInstrument: vi.fn(async () => {
        throw new Error("Network error loading soundbank");
      }),
      onStateChange: (s) => stateTransitions.push(s),
    });

    await expect(provider.prepare()).rejects.toThrow("Network error");
    expect(provider.state).toBe("error");
    expect(stateTransitions).toEqual(["loading", "error"]);
  });
});
