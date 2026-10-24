
// In-memory TTL cache with in-flight request de-duplication.
// To use Redis later, keep the same get/set/wrap interface and swap the internals.
export class TTLCache {
  constructor(maxEntries = 2000) {
    this.store = new Map();
    this.inflight = new Map();
    this.maxEntries = maxEntries;
  }
 
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }
 
  set(key, value, ttlSeconds) {
    if (this.store.size >= this.maxEntries) {
      // evict the oldest entry
      this.store.delete(this.store.keys().next().value);
    }
    this.store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  }
 
  // Returns { data, cached }. If many users request the same missing key at once,
  // only one upstream call is made.
  async wrap(key, ttlSeconds, fetcher) {
    const hit = this.get(key);
    if (hit !== undefined) return { data: hit, cached: true };
 
    if (this.inflight.has(key)) {
      return { data: await this.inflight.get(key), cached: true };
    }
 
    const promise = fetcher()
      .then((data) => {
        this.set(key, data, ttlSeconds);
        return data;
      })
      .finally(() => this.inflight.delete(key));
 
    this.inflight.set(key, promise);
    return { data: await promise, cached: false };
  }
}
 
export const cache = new TTLCache();