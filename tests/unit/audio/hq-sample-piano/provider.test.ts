import { describe, expect, it, vi } from "vitest";
import type { AudioClock, AudioNoteEvent } from "../../../../src/audio/contracts";
import type { HqPianoManifest } from "../../../../src/audio/hq-sample-piano/manifest";
import { HqSamplePianoProvider } from "../../../../src/audio/hq-sample-piano/provider";
import { SampleCache } from "../../../../src/audio/hq-sample-piano/sampleCache";

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
        id: "C4v4",
        rootPitch: 60,
        keyRange: { min: 59, max: 61 },
        velocityRange: { min: 25, max: 32 },
        velocityLayer: 4,
        assetPath: "samples/C4v4.ogg",
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
    expect(provider.loadedManifest).toEqual(manifest);
  });

  it("handles prepare failure by transitioning to error state", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
    })) as unknown as typeof fetch;

    const provider = new HqSamplePianoProvider({
      manifestUrl: "/non-existent/manifest.json",
      fetchFn: fetchMock,
    });

    await expect(provider.prepare()).rejects.toThrow();
    expect(provider.state).toBe("error");
  });

  it("schedules events with velocity-sensitive layer selection and playbackRate", async () => {
    const { ctx, createdSources, createdGains } = createMockAudioContext();
    const manifest = createTestManifest();

    const fetchMock = vi.fn(async (_path: string) => createMockAudioBuffer());
    const cache = new SampleCache({ fetchAudioBuffer: fetchMock, maxEntries: 10 });

    const provider = new HqSamplePianoProvider({
      manifestData: manifest,
      audioContext: ctx,
      sampleCache: cache,
    });

    await provider.prepare();

    const clock: AudioClock = { now: () => 5.0 };

    const events: AudioNoteEvent[] = [
      {
        pitch: 60, // C4 root 60
        startSeconds: 0.0,
        durationSeconds: 1.0,
        velocity: 30, // Layer 4 (low)
        channelRole: "upper",
      },
      {
        pitch: 60, // C4 root 60
        startSeconds: 1.0,
        durationSeconds: 1.0,
        velocity: 78, // Layer 10 (medium)
        channelRole: "upper",
      },
      {
        pitch: 61, // C#4 -> root 60 shifted +1 semitone
        startSeconds: 2.0,
        durationSeconds: 1.0,
        velocity: 110, // Layer 14 (high)
        channelRole: "upper",
      },
    ];

    const playback = provider.schedule(events, clock);
    expect(playback.id).toBeDefined();

    // Allow async note scheduling promises to resolve
    await (playback as { ready?: Promise<void> }).ready;

    expect(createdSources).toHaveLength(3);
    expect(createdGains).toHaveLength(3);

    // Note 1: Layer 4, playbackRate 1.0
    expect(fetchMock).toHaveBeenCalledWith("samples/C4v4.ogg");
    expect(createdSources[0].playbackRate.value).toBe(1.0);
    expect(createdSources[0].start).toHaveBeenCalledWith(5.0); // 5.0 + 0.0

    // Note 2: Layer 10, playbackRate 1.0
    expect(fetchMock).toHaveBeenCalledWith("samples/C4v10.ogg");
    expect(createdSources[1].playbackRate.value).toBe(1.0);
    expect(createdSources[1].start).toHaveBeenCalledWith(6.0); // 5.0 + 1.0

    // Note 3: Layer 14, pitch shift +1 semitone => playbackRate 2^(1/12)
    expect(fetchMock).toHaveBeenCalledWith("samples/C4v14.ogg");
    expect(createdSources[2].playbackRate.value).toBeCloseTo(Math.pow(2, 1 / 12), 5);
    expect(createdSources[2].start).toHaveBeenCalledWith(7.0); // 5.0 + 2.0
  });

  it("inspectEventMapping returns exact diagnostic metadata for review tables", async () => {
    const manifest = createTestManifest();
    const provider = new HqSamplePianoProvider({ manifestData: manifest });
    await provider.prepare();

    const low = provider.inspectEventMapping(60, 30);
    expect(low).toEqual({
      midiPitch: 60,
      velocity: 30,
      sampleRoot: 60,
      velocityLayer: 4,
      assetPath: "samples/C4v4.ogg",
      playbackRate: 1.0,
    });

    const medium = provider.inspectEventMapping(60, 77);
    expect(medium).toEqual({
      midiPitch: 60,
      velocity: 77,
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
          velocity: 80,
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
