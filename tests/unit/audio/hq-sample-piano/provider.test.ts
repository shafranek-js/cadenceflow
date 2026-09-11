import { describe, expect, it, vi } from "vitest";
import type {
  AudioClock,
  AudioNoteEvent,
  InstrumentAudioProvider,
} from "../../../../src/audio/contracts";
import type { HqPianoManifest } from "../../../../src/audio/hq-sample-piano/manifest";
import { HqSamplePianoProvider } from "../../../../src/audio/hq-sample-piano/provider";
import { SampleCache } from "../../../../src/audio/hq-sample-piano/sampleCache";
import { SpessaSoundFontProvider } from "../../../../src/audio/soundfont/spessaProvider";

function createMockAudioBuffer(duration = 2.0): AudioBuffer {
  return {
    duration,
    length: 48000 * duration,
    numberOfChannels: 2,
    sampleRate: 48000,
    getChannelData: () => new Float32Array(100),
  } as unknown as AudioBuffer;
}

interface MockSourceNode {
  buffer: AudioBuffer | null;
  playbackRate: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
}

interface MockGainNode {
  gain: {
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

function createMockAudioContext() {
  const createdSources: MockSourceNode[] = [];
  const createdGains: MockGainNode[] = [];

  const mockCtx = {
    currentTime: 0,
    destination: {},
    createBufferSource: vi.fn(() => {
      const src = {
        buffer: null as AudioBuffer | null,
        playbackRate: { value: 1.0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      createdSources.push(src);
      return src as unknown as AudioBufferSourceNode;
    }),
    createGain: vi.fn(() => {
      const gain = {
        gain: {
          value: 1.0,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      createdGains.push(gain);
      return gain as unknown as GainNode;
    }),
    decodeAudioData: vi.fn(async (_arr: ArrayBuffer) => createMockAudioBuffer()),
    close: vi.fn(async () => undefined),
  };

  return {
    ctx: mockCtx as unknown as AudioContext,
    createdSources,
    createdGains,
  };
}

function createTestManifest(): HqPianoManifest {
  return {
    schemaVersion: 1,
    instrumentId: "salamander-grand-v3",
    displayName: "Salamander Grand Piano V3",
    sampleFormat: "ogg",
    sampleRate: 48000,
    regions: [
      {
        id: "C4v2",
        rootPitch: 60,
        keyRange: { min: 59, max: 61 },
        velocityRange: { min: 27, max: 34 },
        velocityLayer: 2,
        assetPath: "samples/C4v2.ogg",
      },
      {
        id: "C4v10",
        rootPitch: 60,
        keyRange: { min: 59, max: 61 },
        velocityRange: { min: 73, max: 80 },
        velocityLayer: 10,
        assetPath: "samples/C4v10.ogg",
      },
      {
        id: "C4v14",
        rootPitch: 60,
        keyRange: { min: 59, max: 61 },
        velocityRange: { min: 105, max: 112 },
        velocityLayer: 14,
        assetPath: "samples/C4v14.ogg",
      },
      {
        id: "Ds4v10",
        rootPitch: 63,
        keyRange: { min: 62, max: 64 },
        velocityRange: { min: 73, max: 80 },
        velocityLayer: 10,
        assetPath: "samples/Ds4v10.ogg",
      },
    ],
  };
}

describe("T092 — HqSamplePianoProvider", () => {
  it("transitions lifecycle state predictably: idle -> loading -> ready", async () => {
    const { ctx } = createMockAudioContext();
    const manifest = createTestManifest();

    const provider = new HqSamplePianoProvider({
      manifestData: manifest,
      audioContext: ctx,
    });

    expect(provider.state).toBe("idle");
    const preparePromise = provider.prepare();
    expect(provider.state).toBe("loading");
    await preparePromise;
    expect(provider.state).toBe("ready");
  });

  it("schedules polyphonic audio note events with precise buffer and gain mapping", async () => {
    const { ctx, createdSources, createdGains } = createMockAudioContext();
    const manifest = createTestManifest();
    const cache = new SampleCache({
      fetchAudioBuffer: async () => createMockAudioBuffer(1.5),
    });

    const provider = new HqSamplePianoProvider({
      manifestData: manifest,
      audioContext: ctx,
      sampleCache: cache,
    });

    await provider.prepare();

    const mockClock: AudioClock = { now: () => 10.0 };
    const events: readonly AudioNoteEvent[] = [
      {
        pitch: 60,
        startSeconds: 0.0,
        durationSeconds: 0.5,
        velocity: 78, // maps to layer 10 (73..80)
        channelRole: "upper",
      },
      {
        pitch: 63,
        startSeconds: 0.25,
        durationSeconds: 0.5,
        velocity: 78, // maps to layer 10 (73..80)
        channelRole: "upper",
      },
    ];

    const playback = provider.schedule(events, mockClock);
    expect(playback.id).toMatch(/^hq-playback-/);

    await (playback as { ready?: Promise<void> }).ready;

    expect(createdSources).toHaveLength(2);
    expect(createdGains).toHaveLength(2);

    expect(createdSources[0].playbackRate.value).toBe(1.0);
    expect(createdSources[0].start).toHaveBeenCalledWith(10.0);
    expect(createdSources[0].stop).toHaveBeenCalledWith(10.55);

    expect(createdSources[1].playbackRate.value).toBe(1.0);
    expect(createdSources[1].start).toHaveBeenCalledWith(10.25);
    expect(createdSources[1].stop).toHaveBeenCalledWith(10.8);
  });

  it("applies the Harmony Track volume to scheduled piano gain", async () => {
    const { ctx, createdGains } = createMockAudioContext();
    const provider = new HqSamplePianoProvider({
      manifestData: createTestManifest(),
      audioContext: ctx,
      sampleCache: new SampleCache({
        fetchAudioBuffer: async () => createMockAudioBuffer(),
      }),
      volume: 64,
    });

    await provider.prepare();
    const playback = provider.schedule(
      [
        {
          pitch: 60,
          startSeconds: 0,
          durationSeconds: 0.5,
          velocity: 78,
          channelRole: "upper",
        },
      ],
      { now: () => 0 },
    );
    await (playback as { ready?: Promise<void> }).ready;

    expect(createdGains[0]?.gain.setValueAtTime).toHaveBeenCalledWith(
      Math.pow(78 / 127, 1.2) * (64 / 127),
      0,
    );
  });

  it("inspectEventMapping resolves layer, pitch transposition, and asset path without playing", async () => {
    const { ctx } = createMockAudioContext();
    const manifest = createTestManifest();

    const provider = new HqSamplePianoProvider({
      manifestData: manifest,
      audioContext: ctx,
    });

    await provider.prepare();

    const low = provider.inspectEventMapping(60, 30);
    expect(low).toEqual({
      midiPitch: 60,
      velocity: 30,
      sampleRoot: 60,
      velocityLayer: 2,
      assetPath: "samples/C4v2.ogg",
      playbackRate: 1.0,
    });

    const medium = provider.inspectEventMapping(60, 78);
    expect(medium).toEqual({
      midiPitch: 60,
      velocity: 78,
      sampleRoot: 60,
      velocityLayer: 10,
      assetPath: "samples/C4v10.ogg",
      playbackRate: 1.0,
    });

    const high = provider.inspectEventMapping(60, 110);
    expect(high).toEqual({
      midiPitch: 60,
      velocity: 110,
      sampleRoot: 60,
      velocityLayer: 14,
      assetPath: "samples/C4v14.ogg",
      playbackRate: 1.0,
    });
  });

  it("transitions to state 'error' and throws when manifest preparation fails", async () => {
    const { ctx } = createMockAudioContext();
    const fetchMock = vi.fn(async () => {
      throw new Error("HTTP 404 Manifest Not Found");
    });

    const provider = new HqSamplePianoProvider({
      manifestUrl: "/invalid/path/manifest.json",
      audioContext: ctx,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(provider.state).toBe("idle");
    await expect(provider.prepare()).rejects.toThrow("HTTP 404 Manifest Not Found");
    expect(provider.state).toBe("error");
  });

  it("transitions to state 'fallback' and rejects playback.ready on HTTP/sample load failure", async () => {
    const { ctx } = createMockAudioContext();
    const manifest = createTestManifest();
    const cache = new SampleCache({
      fetchAudioBuffer: async () => {
        throw new Error("HTTP 503 Sample asset unavailable");
      },
    });

    const provider = new HqSamplePianoProvider({
      manifestData: manifest,
      audioContext: ctx,
      sampleCache: cache,
    });

    await provider.prepare();
    expect(provider.state).toBe("ready");

    const events: AudioNoteEvent[] = [
      { pitch: 60, startSeconds: 0, durationSeconds: 0.5, velocity: 78, channelRole: "upper" },
    ];

    const playback = provider.schedule(events, { now: () => 0 });
    // Caller-visible rejection
    await expect((playback as { ready?: Promise<void> }).ready).rejects.toThrow(
      "HTTP 503 Sample asset unavailable",
    );

    // Observable provider state
    expect(provider.state).toBe("fallback");
  });

  it("transitions to state 'fallback' and rejects playback.ready on decode failure", async () => {
    const { ctx } = createMockAudioContext();
    const manifest = createTestManifest();
    const cache = new SampleCache({
      fetchAudioBuffer: async () => {
        throw new DOMException(
          "The buffer passed to decodeAudioData could not be decoded",
          "EncodingError",
        );
      },
    });

    const provider = new HqSamplePianoProvider({
      manifestData: manifest,
      audioContext: ctx,
      sampleCache: cache,
    });

    await provider.prepare();

    const playback = provider.schedule(
      [{ pitch: 60, startSeconds: 0, durationSeconds: 0.5, velocity: 78, channelRole: "upper" }],
      { now: () => 0 },
    );

    await expect((playback as { ready?: Promise<void> }).ready).rejects.toThrow(
      "could not be decoded",
    );
    expect(provider.state).toBe("fallback");
  });

  it("demonstrates seamless fallback handoff to alternative provider without touching domain state", async () => {
    const { ctx } = createMockAudioContext();
    const manifest = createTestManifest();

    // Primary HQ provider that fails
    const failingCache = new SampleCache({
      fetchAudioBuffer: async () => {
        throw new Error("Network offline");
      },
    });

    const hqProvider: InstrumentAudioProvider = new HqSamplePianoProvider({
      manifestData: manifest,
      audioContext: ctx,
      sampleCache: failingCache,
    });
    await hqProvider.prepare();

    // Secondary fallback provider
    const fallbackProvider: InstrumentAudioProvider = new SpessaSoundFontProvider({
      synthFactory: async () => ({
        noteOn: vi.fn(),
        noteOff: vi.fn(),
        stopAll: vi.fn(),
        destroy: vi.fn(),
      }),
      audioContext: ctx,
    });
    await fallbackProvider.prepare();
    expect(fallbackProvider.state).toBe("ready");

    const events: AudioNoteEvent[] = [
      { pitch: 60, startSeconds: 0, durationSeconds: 0.5, velocity: 78, channelRole: "upper" },
    ];
    const clock: AudioClock = { now: () => 0 };

    let activeProvider: InstrumentAudioProvider = hqProvider;

    // Caller executes playback with error recovery
    try {
      const playback = activeProvider.schedule(events, clock);
      await (playback as { ready?: Promise<void> }).ready;
    } catch {
      if (activeProvider.state === "fallback" || activeProvider.state === "error") {
        // Switch to fallback provider
        activeProvider = fallbackProvider;
      }
    }

    expect(activeProvider).toBe(fallbackProvider);
    expect(activeProvider.state).toBe("ready");

    // Fallback provider successfully schedules without issues
    const fallbackPlayback = activeProvider.schedule(events, clock);
    expect(fallbackPlayback).toBeDefined();
    expect(fallbackPlayback.id).toMatch(/^sf-playback-/);
  });

  it("stop() and dispose() safely and idempotently cancel active audio nodes", async () => {
    const { ctx, createdSources } = createMockAudioContext();
    const manifest = createTestManifest();
    const cache = new SampleCache({
      fetchAudioBuffer: async () => createMockAudioBuffer(),
    });

    const provider = new HqSamplePianoProvider({
      manifestData: manifest,
      audioContext: ctx,
      sampleCache: cache,
    });

    await provider.prepare();
    const playback = provider.schedule(
      [
        {
          pitch: 60,
          startSeconds: 0,
          durationSeconds: 1,
          velocity: 78,
          channelRole: "upper",
        },
      ],
      { now: () => 0 },
    );

    await (playback as { ready?: Promise<void> }).ready;

    // Call stop() repeatedly
    expect(() => provider.stop()).not.toThrow();
    expect(() => provider.stop({ sessionId: "sess-1" })).not.toThrow();
    expect(createdSources[0].stop).toHaveBeenCalled();

    // Dispose
    await provider.dispose();
    expect(provider.state).toBe("idle");
    expect(provider.cache).toBeNull();
  });
});
