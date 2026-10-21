import { getRedisConnection, isRedisAvailable } from '../lib/redis';

interface MemoryCacheEntry {
  data: any;
  expiresAt: number;
}

class CacheService {
  private memoryCache = new Map<string, MemoryCacheEntry>();
  private inFlightFetches = new Map<string, Promise<any>>();
  private readonly MAX_MEMORY_KEYS = 1000;

  /**
   * Safe getter: checks Redis first if available, otherwise checks memory cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (await isRedisAvailable()) {
        const client = getRedisConnection();
        const raw = await client.get(key);
        if (raw) {
          return JSON.parse(raw) as T;
        }
      }
    } catch {
      // Redis command failed; smoothly fall through to memory cache
    }

    // Memory cache fallback
    const entry = this.memoryCache.get(key);
    if (entry) {
      if (Date.now() < entry.expiresAt) {
        return entry.data as T;
      }
      this.memoryCache.delete(key);
    }

    return null;
  }

  /**
   * Safe setter: sets Redis with EX, and updates in-memory cache
   */
  async set(key: string, value: any, ttlSeconds: number = 30): Promise<void> {
    const serialized = JSON.stringify(value);

    try {
      if (await isRedisAvailable()) {
        const client = getRedisConnection();
        await client.set(key, serialized, 'EX', ttlSeconds);
      }
    } catch {
      // Redis set failed; memory cache will handle it
    }

    // Guard memory cache size to avoid memory leaks
    if (this.memoryCache.size >= this.MAX_MEMORY_KEYS) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) this.memoryCache.delete(firstKey);
    }

    this.memoryCache.set(key, {
      data: value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * Delete specific key from both caches
   */
  async del(key: string): Promise<void> {
    this.memoryCache.delete(key);
    this.inFlightFetches.delete(key);
    try {
      if (await isRedisAvailable()) {
        const client = getRedisConnection();
        await client.del(key);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Invalidate all keys matching a prefix or pattern
   */
  async invalidatePattern(prefix: string): Promise<void> {
    // Purge memory cache
    for (const k of this.memoryCache.keys()) {
      if (k.startsWith(prefix) || k.includes(prefix)) {
        this.memoryCache.delete(k);
        this.inFlightFetches.delete(k);
      }
    }

    // Purge Redis keys matching pattern
    try {
      if (await isRedisAvailable()) {
        const client = getRedisConnection();
        const keys = await client.keys(`${prefix}*`);
        if (keys.length > 0) {
          await client.del(...keys);
        }
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Atomic get-or-set wrapper with full stampede protection (Promise coalesce)
   */
  async getOrSet<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    // Single-flight deduplication: collapse simultaneous concurrent requests for the same key into ONE execution
    let inFlight = this.inFlightFetches.get(key);
    if (!inFlight) {
      inFlight = (async () => {
        try {
          const fresh = await fetcher();
          await this.set(key, fresh, ttlSeconds);
          return fresh;
        } finally {
          this.inFlightFetches.delete(key);
        }
      })();
      this.inFlightFetches.set(key, inFlight);
    }

    return inFlight;
  }
}

export const cacheService = new CacheService();

