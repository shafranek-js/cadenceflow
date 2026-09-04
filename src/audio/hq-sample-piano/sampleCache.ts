export interface SampleCacheOptions {
  readonly maxEntries?: number | undefined;
  readonly fetchAudioBuffer: (assetPath: string) => Promise<AudioBuffer>;
}

export interface SampleCacheStats {
  readonly size: number;
  readonly maxEntries: number;
  readonly inFlightCount: number;
  readonly hits: number;
  readonly misses: number;
}

export class SampleCache {
  private readonly maxEntries: number;
  private readonly fetchBuffer: (assetPath: string) => Promise<AudioBuffer>;

  // Map maintains insertion/access order for LRU eviction
  private readonly bufferCache = new Map<string, AudioBuffer>();
  private readonly inFlightLoads = new Map<string, Promise<AudioBuffer>>();

  private hitsCount = 0;
  private missesCount = 0;

  constructor(options: SampleCacheOptions) {
    this.maxEntries = options.maxEntries ?? 64;
    this.fetchBuffer = options.fetchAudioBuffer;
  }

  get size(): number {
    return this.bufferCache.size;
  }

  get stats(): SampleCacheStats {
    return {
      size: this.bufferCache.size,
      maxEntries: this.maxEntries,
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

        // Put in cache and enforce LRU bound
        this.bufferCache.delete(assetPath);
        this.bufferCache.set(assetPath, buffer);

        while (this.bufferCache.size > this.maxEntries) {
          const oldestKey = this.bufferCache.keys().next().value;
          if (oldestKey !== undefined) {
            this.bufferCache.delete(oldestKey);
          }
        }

        return buffer;
      } catch (err) {
        // Do not permanently poison cache on transient failure
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
  }

  /**
   * Dispose cache completely.
   */
  dispose(): void {
    this.clear();
  }
}
