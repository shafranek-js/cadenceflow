import { describe, expect, it, vi } from "vitest";
import { SampleCache } from "../../../../src/audio/hq-sample-piano/sampleCache";

function createMockAudioBuffer(duration = 1.0): AudioBuffer {
  return {
    duration,
    length: 48000 * duration,
    numberOfChannels: 2,
    sampleRate: 48000,
    getChannelData: () => new Float32Array(48000 * duration),
    copyFromChannel: () => undefined,
    copyToChannel: () => undefined,
  } as unknown as AudioBuffer;
}

describe("T091 — SampleCache (LRU Decoded Buffer Cache)", () => {
  it("caches decoded AudioBuffers and decodes the same asset only once", async () => {
    const fetchMock = vi.fn(async (_path: string) => createMockAudioBuffer());
    const cache = new SampleCache({ fetchAudioBuffer: fetchMock, maxEntries: 10 });

    const buf1 = await cache.get("samples/C4v10.ogg");
    const buf2 = await cache.get("samples/C4v10.ogg");

    expect(buf1).toBe(buf2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cache.stats.hits).toBe(1);
    expect(cache.stats.misses).toBe(1);
    expect(cache.size).toBe(1);
  });

  it("deduplicates concurrent in-flight requests for the same asset", async () => {
    let resolveFirst!: (buf: AudioBuffer) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<AudioBuffer>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const cache = new SampleCache({ fetchAudioBuffer: fetchMock, maxEntries: 10 });

    // Initiate two concurrent requests before the first finishes
    const promise1 = cache.get("samples/C4v10.ogg");
    const promise2 = cache.get("samples/C4v10.ogg");

    expect(cache.stats.inFlightCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const mockBuffer = createMockAudioBuffer();
    resolveFirst(mockBuffer);

    const [res1, res2] = await Promise.all([promise1, promise2]);
    expect(res1).toBe(mockBuffer);
    expect(res2).toBe(mockBuffer);
    expect(cache.stats.inFlightCount).toBe(0);
  });

  it("does not permanently poison the cache on transient load failures", async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Network timeout");
      }
      return createMockAudioBuffer();
    });

    const cache = new SampleCache({ fetchAudioBuffer: fetchMock, maxEntries: 10 });

    // First attempt fails
    await expect(cache.get("samples/retry.ogg")).rejects.toThrow("Network timeout");
    expect(cache.has("samples/retry.ogg")).toBe(false);
    expect(cache.stats.inFlightCount).toBe(0);

    // Second attempt succeeds
    const recovered = await cache.get("samples/retry.ogg");
    expect(recovered).toBeDefined();
    expect(cache.has("samples/retry.ogg")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("enforces maxEntries bound using deterministic LRU eviction", async () => {
    const fetchMock = vi.fn(async (path: string) => createMockAudioBuffer(path.length));
    const cache = new SampleCache({ fetchAudioBuffer: fetchMock, maxEntries: 3 });

    await cache.get("asset-1");
    await cache.get("asset-2");
    await cache.get("asset-3");
    expect(cache.size).toBe(3);

    // Access asset-1 again to make asset-2 the least recently used
    await cache.get("asset-1");

    // Add asset-4: asset-2 should be evicted!
    await cache.get("asset-4");
    expect(cache.size).toBe(3);

    expect(cache.has("asset-1")).toBe(true);
    expect(cache.has("asset-3")).toBe(true);
    expect(cache.has("asset-4")).toBe(true);
    expect(cache.has("asset-2")).toBe(false); // evicted!
  });

  it("clear() and dispose() release all cached buffers", async () => {
    const fetchMock = vi.fn(async () => createMockAudioBuffer());
    const cache = new SampleCache({ fetchAudioBuffer: fetchMock, maxEntries: 5 });

    await cache.get("item-1");
    await cache.get("item-2");
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has("item-1")).toBe(false);

    cache.dispose();
    expect(cache.size).toBe(0);
  });
});
