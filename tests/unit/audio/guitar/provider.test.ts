import { describe, expect, it, vi } from "vitest";
import {
  AcousticGuitarProvider,
  type GuitarSampleNode,
  type GuitarSamplePlayer,
} from "../../../../src/audio/guitar/AcousticGuitarProvider";
import type { AudioNoteEvent } from "../../../../src/audio/contracts";

function createMockPlayer(): GuitarSamplePlayer & {
  play: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} {
  return {
    play: vi.fn(() => ({ stop: vi.fn() } as GuitarSampleNode)),
    stop: vi.fn(),
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
    const loader = vi.fn(async () => player);

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

  it("schedules chord notes with acoustic guitar downstrum stagger (lowest to highest pitch)", async () => {
    const player = createMockPlayer();
    const loader = vi.fn(async () => player);
    const mockCtx = createMockContext();

    const provider = new AcousticGuitarProvider({
      audioContext: mockCtx,
      loadInstrument: loader,
      strumDelaySeconds: 0.016,
      volume: 100,
    });
    await provider.prepare();

    // Simultaneous chord notes passed in non-sorted order (e.g. 52, 40, 47)
    const chordEvents: AudioNoteEvent[] = [
      { pitch: 52, startSeconds: 0.5, durationSeconds: 1.5, velocity: 90, channelRole: "upper" },
      { pitch: 40, startSeconds: 0.5, durationSeconds: 1.5, velocity: 90, channelRole: "upper" },
      { pitch: 47, startSeconds: 0.5, durationSeconds: 1.5, velocity: 90, channelRole: "upper" },
    ];

    const playback = provider.schedule(chordEvents, { now: () => 10 });
    expect(playback.id).toMatch(/^guitar-live-/);

    // Should play 3 notes sorted ascending by pitch (40 -> 47 -> 52)
    expect(player.play).toHaveBeenCalledTimes(3);

    const call1 = player.play.mock.calls[0]!;
    const call2 = player.play.mock.calls[1]!;
    const call3 = player.play.mock.calls[2]!;

    expect(call1[0]).toBe(40); // lowest note: string delay 0
    expect(call1[1]).toBeCloseTo(10.5, 4);

    expect(call2[0]).toBe(47); // second note: string delay 1 * 0.016
    expect(call2[1]).toBeCloseTo(10.5 + 0.016, 4);

    expect(call3[0]).toBe(52); // highest note: string delay 2 * 0.016
    expect(call3[1]).toBeCloseTo(10.5 + 0.032, 4);
  });

  it("schedules melodic scale notes at exact start times without strum offset", async () => {
    const player = createMockPlayer();
    const loader = vi.fn(async () => player);

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
      loadInstrument: vi.fn(async () => player),
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
