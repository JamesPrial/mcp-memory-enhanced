import { Entity, Relation } from '../types.js';

interface CacheConfig {
  maxSize?: number;
  ttl?: number;
}

interface CacheEntry<T> {
  value: T;
  expires: number;
  size: number;
}

export class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private accessOrder: K[] = [];
  private config: Required<CacheConfig>;
  private currentSize = 0;

  constructor(config: CacheConfig = {}) {
    this.config = {
      maxSize: config.maxSize || 100 * 1024 * 1024, // 100MB default
      ttl: config.ttl || 300000 // 5 minutes default
    };
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expires) {
      this.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.updateAccessOrder(key);
    return entry.value;
  }

  set(key: K, value: V, size: number): void {
    // Remove if exists
    if (this.cache.has(key)) {
      this.delete(key);
    }

    // Evict if necessary
    while (this.currentSize + size > this.config.maxSize && this.accessOrder.length > 0) {
      const lru = this.accessOrder.shift()!;
      this.delete(lru);
    }

    this.cache.set(key, {
      value,
      expires: Date.now() + this.config.ttl,
      size
    });
    this.accessOrder.push(key);
    this.currentSize += size;
  }

  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.currentSize -= entry.size;
    return true;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.currentSize = 0;
  }

  private updateAccessOrder(key: K): void {
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
  }

  get stats() {
    return {
      size: this.currentSize,
      entries: this.cache.size,
      maxSize: this.config.maxSize,
      utilization: (this.currentSize / this.config.maxSize) * 100
    };
  }
}

export class QueryCache {
  private entityCache = new LRUCache<string, Entity[]>();
  private relationCache = new LRUCache<string, Relation[]>();
  private searchCache = new LRUCache<string, string[]>();

  cacheEntities(query: string, entities: Entity[]): void {
    const size = JSON.stringify(entities).length;
    this.entityCache.set(query, entities, size);
  }

  getCachedEntities(query: string): Entity[] | undefined {
    return this.entityCache.get(query);
  }

  cacheRelations(query: string, relations: Relation[]): void {
    const size = JSON.stringify(relations).length;
    this.relationCache.set(query, relations, size);
  }

  getCachedRelations(query: string): Relation[] | undefined {
    return this.relationCache.get(query);
  }

  cacheSearch(query: string, results: string[]): void {
    const size = JSON.stringify(results).length;
    this.searchCache.set(query, results, size);
  }

  getCachedSearch(query: string): string[] | undefined {
    return this.searchCache.get(query);
  }

  invalidateEntity(name: string): void {
    // Clear all caches that might contain this entity
    for (const [key] of this.entityCache['cache']) {
      if (key.includes(name)) {
        this.entityCache.delete(key);
      }
    }
    for (const [key] of this.searchCache['cache']) {
      if (key.includes(name)) {
        this.searchCache.delete(key);
      }
    }
  }

  clear(): void {
    this.entityCache.clear();
    this.relationCache.clear();
    this.searchCache.clear();
  }

  get stats() {
    return {
      entities: this.entityCache.stats,
      relations: this.relationCache.stats,
      search: this.searchCache.stats
    };
  }
}