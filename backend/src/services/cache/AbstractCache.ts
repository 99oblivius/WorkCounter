/**
 * Abstract Cache Base Class
 * Eliminates duplication across cache implementations
 *
 * Provides:
 * - TTL-based expiry
 * - Mutex locking to prevent race conditions
 * - Timestamp-based versioning
 * - Statistics tracking
 *
 * Usage:
 *   class MyCache extends AbstractCache<string, MyData> {
 *     constructor() {
 *       super(60000); // 60 second TTL
 *     }
 *   }
 */

interface CachedEntry<T> {
  data: T;
  timestamp: number;
}

interface PendingFetch<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
}

export abstract class AbstractCache<K, V> {
  protected cache = new Map<K, CachedEntry<V>>();
  protected locks = new Map<K, PendingFetch<V>>();
  protected ttl: number;

  constructor(ttlMs: number) {
    this.ttl = ttlMs;
  }

  /**
   * Get cached value for a key
   * Returns null if not found or expired
   */
  protected getCached(key: K): V | null {
    const cached = this.cache.get(key);

    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Set cached value for a key
   * Thread-safe with timestamp-based versioning
   */
  protected setCached(key: K, data: V): void {
    const newEntry: CachedEntry<V> = {
      data,
      timestamp: Date.now()
    };

    const existing = this.cache.get(key);

    // Only update if this is newer or no existing cache
    if (!existing || newEntry.timestamp >= existing.timestamp) {
      this.cache.set(key, newEntry);
    }
  }

  /**
   * Acquire lock for fetching data
   * Prevents multiple concurrent fetches for same key (thundering herd prevention)
   *
   * If a fetch is already in progress for this key, waits for it to complete
   * Otherwise, executes fetchFn and broadcasts result to all waiting callers
   */
  protected async acquireLock(key: K, fetchFn: () => Promise<V>): Promise<V> {
    // Check if already locked (fetch in progress)
    const existingLock = this.locks.get(key);
    if (existingLock) {
      // Wait for the ongoing fetch to complete
      return existingLock.promise;
    }

    // Create new lock
    let resolve!: (value: V) => void;
    let reject!: (error: any) => void;

    const promise = new Promise<V>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    this.locks.set(key, { promise, resolve, reject });

    try {
      // Execute the fetch
      const result = await fetchFn();

      // Resolve the lock (unblocks all waiting callers)
      resolve(result);

      // Return result
      return result;
    } catch (error) {
      // Reject the lock (propagates error to all waiting callers)
      reject(error);
      throw error;
    } finally {
      // Always release the lock
      this.locks.delete(key);
    }
  }

  /**
   * Invalidate specific key
   * Also clears any pending locks for that key
   */
  protected invalidateKey(key: K): void {
    this.cache.delete(key);
    this.locks.delete(key);
  }

  /**
   * Invalidate keys matching a predicate
   * Useful for bulk invalidations (e.g., all keys for a user)
   */
  protected invalidateWhere(predicate: (key: K) => boolean): void {
    for (const key of this.cache.keys()) {
      if (predicate(key)) {
        this.cache.delete(key);
        this.locks.delete(key);
      }
    }
  }

  /**
   * Invalidate entire cache
   */
  protected invalidateAll(): void {
    this.cache.clear();
    this.locks.clear();
  }

  /**
   * Get cache statistics (for monitoring)
   */
  getStats() {
    return {
      size: this.cache.size,
      ttl: this.ttl,
      activeLocks: this.locks.size
    };
  }

  /**
   * Manually trigger expired entry cleanup
   * Useful for long-running processes to prevent memory leaks
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}
