import { describe, expect, it, vi } from "vitest";
import {
  SampleCache,
  calculateAudioBufferBytes,
} from "../../../../src/audio/hq-sample-piano/sampleCache";

function createMockAudioBuffer(duration = 1.0, channels = 2, sampleRate = 48000): AudioBuffer {
  const length = sampleRate * duration;
  return {
    duration,
    length,
    numberOfChannels: channels,
    sampleRate,
    getChannelData: () => new Float32Array(length),
    copyFromChannel: () => undefined,
    copyToChannel: () => undefined,
  } as unknown as AudioBuffer;
}

describe("T091 — SampleCache (LRU Decoded Buffer Cache & Byte Budget)", () => {
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

  it("does not permanently poison the cache on transient load failures and allows retry", async () => {
    let callCount = 0;
    const fetchMock = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Network timeout");
      }
      return createMockAudioBuffer();
    });

    const cache = new SampleCache({ fetchAudioBuffer: fetchMock, maxEntries: 10 });

    // 1. Request asset A -> fetch/decode fails
    await expect(cache.get("samples/retry.ogg")).rejects.toThrow("Network timeout");

    // 2. In-flight entry is cleared
    expect(cache.has("samples/retry.ogg")).toBe(false);
    expect(cache.stats.inFlightCount).toBe(0);

    // 3. Retry asset A -> second fetch/decode succeeds
    const recovered = await cache.get("samples/retry.ogg");

    // 4. Cache becomes healthy
    expect(recovered).toBeDefined();
    expect(cache.has("samples/retry.ogg")).toBe(true);
    expect(cache.stats.size).toBe(1);
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

  it("accurately tracks decoded PCM byte accounting", async () => {
    // 1 second, 2 channels, 48000 Hz: 48000 * 2 * 4 = 384,000 bytes
    const buf1s = createMockAudioBuffer(1.0, 2, 48000);
    expect(calculateAudioBufferBytes(buf1s)).toBe(384000);

    const fetchMock = vi.fn(async () => buf1s);
    const cache = new SampleCache({ fetchAudioBuffer: fetchMock, maxEntries: 10 });

    await cache.get("buffer-1");
    expect(cache.totalDecodedBytes).toBe(384000);
    expect(cache.stats.totalDecodedBytes).toBe(384000);

    await cache.get("buffer-2");
    expect(cache.totalDecodedBytes).toBe(768000);
  });

  it("evicts least recently used buffers when maxDecodedBytes budget is exceeded", async () => {
    // Each 1s buffer is 384,000 bytes.
    // Set budget to 1,000,000 bytes (holds at most 2 buffers = 768,000 bytes; 3rd buffer would require 1,152,000 bytes).
    const maxBytes = 1000000;
    const fetchMock = vi.fn(async () => createMockAudioBuffer(1.0, 2, 48000));
    const cache = new SampleCache({
      fetchAudioBuffer: fetchMock,
      maxEntries: 100,
      maxDecodedBytes: maxBytes,
    });

    await cache.get("buf-A"); // 384k
    await cache.get("buf-B"); // 768k
    expect(cache.size).toBe(2);
    expect(cache.totalDecodedBytes).toBe(768000);

    // Refresh buf-A so buf-B becomes LRU
    await cache.get("buf-A");

    // Add buf-C (384k): adding it would exceed 1MB, so buf-B must be evicted!
    await cache.get("buf-C");
    expect(cache.has("buf-A")).toBe(true);
    expect(cache.has("buf-C")).toBe(true);
    expect(cache.has("buf-B")).toBe(false); // evicted!
    expect(cache.size).toBe(2);
    expect(cache.totalDecodedBytes).toBe(768000);
    expect(cache.totalDecodedBytes).toBeLessThanOrEqual(maxBytes);
  });

  it("explicitly handles oversized single item that exceeds maxDecodedBytes", async () => {
    // Budget is 500,000 bytes. Single 2s buffer is 768,000 bytes (> budget).
    const maxBytes = 500000;
    const oversizedBuffer = createMockAudioBuffer(2.0, 2, 48000); // 768,000 bytes
    const smallBuffer = createMockAudioBuffer(0.5, 2, 48000); // 192,000 bytes

    const fetchMock = vi.fn(async (path: string) => {
      return path === "oversized" ? oversizedBuffer : smallBuffer;
    });

    const cache = new SampleCache({
      fetchAudioBuffer: fetchMock,
      maxDecodedBytes: maxBytes,
    });

    // Populate with small item first
    await cache.get("small-1");
    expect(cache.size).toBe(1);

    // Load oversized buffer: evicts existing items and admits oversized item so playback can proceed
    await cache.get("oversized");
    expect(cache.has("small-1")).toBe(false); // evicted
    expect(cache.has("oversized")).toBe(true);
    expect(cache.size).toBe(1);
    expect(cache.totalDecodedBytes).toBe(768000);
  });

  it("clear() and dispose() release all cached buffers, in-flight state, and reset byte tracking", async () => {
    const fetchMock = vi.fn(async () => createMockAudioBuffer(1.0, 2, 48000));
    const cache = new SampleCache({ fetchAudioBuffer: fetchMock, maxEntries: 5 });

    await cache.get("item-1");
    await cache.get("item-2");
    expect(cache.size).toBe(2);
    expect(cache.totalDecodedBytes).toBe(768000);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.totalDecodedBytes).toBe(0);
    expect(cache.has("item-1")).toBe(false);

    cache.dispose();
    expect(cache.size).toBe(0);
    expect(cache.totalDecodedBytes).toBe(0);
  });
});
