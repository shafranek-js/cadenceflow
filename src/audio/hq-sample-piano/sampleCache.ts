export interface SampleCacheOptions {
  readonly maxEntries?: number | undefined;
  readonly maxDecodedBytes?: number | undefined;
  readonly fetchAudioBuffer: (assetPath: string) => Promise<AudioBuffer>;
}

export interface SampleCacheStats {
  readonly size: number;
  readonly maxEntries: number;
  readonly totalDecodedBytes: number;
  readonly maxDecodedBytes: number;
  readonly inFlightCount: number;
  readonly hits: number;
  readonly misses: number;
}

export function calculateAudioBufferBytes(buffer: AudioBuffer): number {
  return buffer.length * buffer.numberOfChannels * 4;
}

export class SampleCache {
  private readonly maxEntries: number;
  private readonly maxDecodedBytes: number;
  private readonly fetchBuffer: (assetPath: string) => Promise<AudioBuffer>;

  // Map maintains insertion/access order for LRU eviction
  private readonly bufferCache = new Map<string, AudioBuffer>();
  private readonly inFlightLoads = new Map<string, Promise<AudioBuffer>>();

  private currentDecodedBytes = 0;
  private hitsCount = 0;
  private missesCount = 0;

  constructor(options: SampleCacheOptions) {
    this.maxEntries = options.maxEntries ?? 64;
    // Default to 128 MB decoded audio budget (~22 full 15s 48kHz stereo buffers)
    this.maxDecodedBytes = options.maxDecodedBytes ?? 128 * 1024 * 1024;
    this.fetchBuffer = options.fetchAudioBuffer;
  }

  get size(): number {
    return this.bufferCache.size;
  }

  get totalDecodedBytes(): number {
    return this.currentDecodedBytes;
  }

  get stats(): SampleCacheStats {
    return {
      size: this.bufferCache.size,
      maxEntries: this.maxEntries,
      totalDecodedBytes: this.currentDecodedBytes,
      maxDecodedBytes: this.maxDecodedBytes,
      inFlightCount: this.inFlightLoads.size,
      hits: this.hitsCount,
      misses: this.missesCount,
    };
  }

  has(assetPath: string): boolean {
    return this.bufferCache.has(assetPath);
  }

  /**
   * Retrieve an AudioBuffer for the given asset path.
   * If already cached, returns immediately (cache hit).
   * If in-flight, shares the existing promise (deduplication).
   * Otherwise initiates fetch/decode, caches result, and applies LRU eviction.
   */
  async get(assetPath: string): Promise<AudioBuffer> {
    // 1. Cache hit
    const existing = this.bufferCache.get(assetPath);
    if (existing) {
      this.hitsCount++;
      // Refresh LRU order by deleting and re-inserting
      this.bufferCache.delete(assetPath);
      this.bufferCache.set(assetPath, existing);
      return existing;
    }

    // 2. In-flight deduplication
    const inFlight = this.inFlightLoads.get(assetPath);
    if (inFlight) {
      return inFlight;
    }

    // 3. Cache miss: initiate load
    this.missesCount++;
    const loadPromise = (async () => {
      try {
        const buffer = await this.fetchBuffer(assetPath);
        this.inFlightLoads.delete(assetPath);

        const newBytes = calculateAudioBufferBytes(buffer);

        // If buffer already existed under this key, subtract old bytes before re-inserting
        const oldBuffer = this.bufferCache.get(assetPath);
        if (oldBuffer) {
          this.currentDecodedBytes -= calculateAudioBufferBytes(oldBuffer);
          this.bufferCache.delete(assetPath);
        }

        // Enforce both entry count and byte budget bounds via LRU eviction
        while (
          this.bufferCache.size > 0 &&
          (this.bufferCache.size >= this.maxEntries ||
            this.currentDecodedBytes + newBytes > this.maxDecodedBytes)
        ) {
          const oldestKey = this.bufferCache.keys().next().value;
          if (oldestKey !== undefined) {
            const evicted = this.bufferCache.get(oldestKey);
            if (evicted) {
              this.currentDecodedBytes -= calculateAudioBufferBytes(evicted);
            }
            this.bufferCache.delete(oldestKey);
          } else {
            break;
          }
        }

        // Oversized single item: if a single buffer exceeds maxDecodedBytes,
        // all other items are evicted, and this item is admitted so current playback can proceed.
        this.bufferCache.set(assetPath, buffer);
        this.currentDecodedBytes += newBytes;

        return buffer;
      } catch (err) {
        // Do not permanently poison cache on transient failure; allow future retry
        this.inFlightLoads.delete(assetPath);
        throw err;
      }
    })();

    this.inFlightLoads.set(assetPath, loadPromise);
    return loadPromise;
  }

  /**
   * Preload a list of asset paths into cache without blocking current playback.
   */
  async preload(assetPaths: readonly string[]): Promise<void> {
    await Promise.all(assetPaths.map((p) => this.get(p).catch(() => undefined)));
  }

  /**
   * Clear all cached buffers and cancel references.
   */
  clear(): void {
    this.bufferCache.clear();
    this.inFlightLoads.clear();
    this.currentDecodedBytes = 0;
  }

  /**
   * Dispose cache completely.
   */
  dispose(): void {
    this.clear();
  }
}
