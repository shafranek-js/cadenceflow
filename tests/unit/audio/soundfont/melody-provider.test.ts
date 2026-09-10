import { describe, expect, it, vi } from "vitest";

import type { AudioNoteEvent } from "../../../../src/audio/contracts";
import {
  MELODY_SAMPLE_FILES,
  MelodySoundFontProvider,
  type MelodySamplePlayer,
} from "../../../../src/audio/soundfont/melodyProvider";

function createPlayer(): MelodySamplePlayer & { play: ReturnType<typeof vi.fn> } {
  return {
    play: vi.fn(() => ({ stop: vi.fn() })),
    stop: vi.fn(),
  };
}

function createContext(): AudioContext {
  return { currentTime: 10, destination: {} } as AudioContext;
}

const event: AudioNoteEvent = Object.freeze({
  pitch: 72,
  startSeconds: 0.25,
  durationSeconds: 0.5,
  velocity: 90,
  channelRole: "melody",
});

describe("T172 — local sampled Melody provider", () => {
  it("deduplicates local instrument loading and schedules decoded samples", async () => {
    const player = createPlayer();
    const loader = vi.fn(async () => player);
    const provider = new MelodySoundFontProvider({
      audioContext: createContext(),
      loadInstrument: loader,
      assetBaseUrl: "/audio/melody/FluidR3_GM/",
      instrument: "violin",
      volume: 100,
    });

    await Promise.all([provider.prepare(), provider.prepare()]);

    expect(provider.state).toBe("ready");
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader.mock.calls[0]?.[1]).toBe("violin");
    expect(loader.mock.calls[0]?.[2]).toBe(
      `/audio/melody/FluidR3_GM/${MELODY_SAMPLE_FILES.violin}`,
    );

    const playback = provider.schedule([event], { now: () => 8 });
    expect(playback.id).toMatch(/^melody-live-/);
    expect(player.play).toHaveBeenCalledWith(72, 10.25, {
      duration: 0.5,
      gain: (90 / 127) * (100 / 127),
    });
  });

  it("keeps live Melody and editor preview cancellation isolated", async () => {
    const violin = createPlayer();
    const cello = createPlayer();
    const loader = vi.fn(async (_context, instrument) => (instrument === "cello" ? cello : violin));
    const provider = new MelodySoundFontProvider({
      audioContext: createContext(),
      loadInstrument: loader,
      instrument: "violin",
    });
    await provider.prepare();
    await provider.preparePreview("cello", 72);

    const live = provider.schedule([event], { now: () => 10 });
    const preview = provider.schedulePreview([event], { now: () => 10 });
    const liveNode = violin.play.mock.results[0]!.value as { stop: ReturnType<typeof vi.fn> };
    const previewNode = cello.play.mock.results[0]!.value as { stop: ReturnType<typeof vi.fn> };

    preview.cancel();
    expect(previewNode.stop).toHaveBeenCalledTimes(1);
    expect(liveNode.stop).not.toHaveBeenCalled();

    live.cancel();
    expect(liveNode.stop).toHaveBeenCalledTimes(1);
  });

  it("stops the live transport without interrupting an active preview", async () => {
    const violin = createPlayer();
    const provider = new MelodySoundFontProvider({
      audioContext: createContext(),
      loadInstrument: vi.fn(async () => violin),
      instrument: "violin",
    });
    await provider.prepare();

    const live = provider.schedule([event], { now: () => 10 });
    const preview = provider.schedulePreview([event], { now: () => 10 });
    const liveNode = violin.play.mock.results[0]!.value as { stop: ReturnType<typeof vi.fn> };
    const previewNode = violin.play.mock.results[1]!.value as { stop: ReturnType<typeof vi.fn> };

    provider.stop();
    expect(liveNode.stop).toHaveBeenCalledTimes(1);
    expect(previewNode.stop).not.toHaveBeenCalled();

    preview.cancel();
    expect(previewNode.stop).toHaveBeenCalledTimes(1);
    live.cancel();
  });

  it("maps every supported instrument to a vendored FluidR3_GM sample file", () => {
    expect(MELODY_SAMPLE_FILES).toEqual({
      violin: "violin-mp3.js",
      cello: "cello-mp3.js",
      oboe: "oboe-mp3.js",
      clarinet: "clarinet-mp3.js",
      flute: "flute-mp3.js",
      "synth-lead": "lead_1_square-mp3.js",
    });
  });
});
