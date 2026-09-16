import { describe, expect, it, vi } from "vitest";

import type { AudioNoteEvent } from "../../../../src/audio/contracts";
import {
  formatMelodyPreparationNotice,
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

  it("loads non-bundled instruments from the FluidR3_GM CDN", async () => {
    const trumpetPlayer = createPlayer();
    const loader = vi.fn(async () => trumpetPlayer);
    const provider = new MelodySoundFontProvider({
      audioContext: createContext(),
      loadInstrument: loader,
      instrument: "gm-056", // trumpet, program 56
    });

    await provider.prepare();

    expect(provider.state).toBe("ready");
    expect(loader).toHaveBeenCalledTimes(1);
    // gm-056 has no local sampleAsset, so it uses the CDN URL
    expect(loader.mock.calls[0]?.[2]).toBe(
      "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/trumpet-mp3.js",
    );

    const playback = provider.schedule([event], { now: () => 8 });
    expect(playback.id).toMatch(/^melody-live-/);
    expect(trumpetPlayer.play).toHaveBeenCalledTimes(1);
    playback.cancel();
  });

  it("mixes CDN-loaded and locally-bundled instruments in one preparation", async () => {
    const violin = createPlayer();
    const trumpet = createPlayer();
    const loader = vi.fn(async (_context, instrument) =>
      instrument === "violin" ? violin : trumpet,
    );
    const provider = new MelodySoundFontProvider({
      audioContext: createContext(),
      loadInstrument: loader,
      instrument: "violin",
    });

    const result = await provider.prepareForInstruments(["violin", "gm-056"]);
    expect(result.ready).toEqual(["gm-056", "violin"]); // sorted
    expect(result.unavailable).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(provider.state).toBe("ready");
    // violin uses local path, gm-056 uses CDN
    expect(loader.mock.calls.find((c) => c[1] === "violin")?.[2]).toBe(
      `/audio/melody/FluidR3_GM/${MELODY_SAMPLE_FILES.violin}`,
    );
    expect(loader.mock.calls.find((c) => c[1] === "gm-056")?.[2]).toBe(
      "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/trumpet-mp3.js",
    );
  });

  it("keeps available playback running when another realtime lane fails to load", async () => {
    const violin = createPlayer();
    const loader = vi.fn(async (_context, instrument) => {
      if (instrument === "cello") throw new Error("cello sample failed");
      return violin;
    });
    const provider = new MelodySoundFontProvider({
      audioContext: createContext(),
      loadInstrument: loader,
      instrument: "violin",
    });

    const result = await provider.prepareForInstruments(["violin", "cello"]);
    expect(result.ready).toEqual(["violin"]);
    expect(result.failed).toEqual(["cello"]);
    expect(provider.state).toBe("ready");
    expect(formatMelodyPreparationNotice(result)).toBe(
      "GM 042 · Cello · Realtime sample failed to load",
    );

    const playback = provider.schedule(
      [
        { ...event, instrument: "cello" },
        { ...event, instrument: "violin", startSeconds: 1 },
      ],
      { now: () => 10 },
    );
    expect(violin.play).toHaveBeenCalledTimes(1);
    playback.cancel();
  });

  it("loads guitar soundfonts gm-024 (nylon) and gm-025 (steel) from local assets", async () => {
    const guitarPlayer = createPlayer();
    const loader = vi.fn(async () => guitarPlayer);
    const provider = new MelodySoundFontProvider({
      audioContext: createContext(),
      loadInstrument: loader,
      assetBaseUrl: "/audio/melody/FluidR3_GM/",
      guitarAssetBaseUrl: "/audio/guitar/",
    });

    await provider.prepareForInstruments(["gm-024", "gm-025"]);

    expect(provider.state).toBe("ready");
    expect(loader).toHaveBeenCalledTimes(2);
    expect(loader.mock.calls.find((c) => c[1] === "gm-024")?.[2]).toBe(
      "/audio/guitar/acoustic_guitar_nylon-mp3.js",
    );
    expect(loader.mock.calls.find((c) => c[1] === "gm-025")?.[2]).toBe(
      "/audio/guitar/acoustic_guitar_steel-mp3.js",
    );
  });
});
