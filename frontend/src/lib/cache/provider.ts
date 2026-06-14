import { prisma } from "../db";

export interface RetrievalCacheValue {
  topResults: any[];
  timestamp: number;
}

// Memory Cache Store (Development/Fallback)
const memoryCacheStore = new Map<string, RetrievalCacheValue>();

class CacheProvider {
  private isProduction = process.env.NODE_ENV === "production";

  async get(key: string): Promise<RetrievalCacheValue | null> {
    if (this.isProduction) {
      // Placeholder for Distributed Cache (e.g. Redis) in production
      return memoryCacheStore.get(key) || null;
    }
    return memoryCacheStore.get(key) || null;
  }

  async set(key: string, value: RetrievalCacheValue): Promise<void> {
    if (this.isProduction) {
      // Placeholder for Distributed Cache set in production
      memoryCacheStore.set(key, value);
      return;
    }
    memoryCacheStore.set(key, value);
  }

  // Invalidate the cache when documents are reindexed/updated
  async invalidateSubjectCache(subjectId: number): Promise<void> {
    // Clear in-memory keys or notify Redis cluster
    memoryCacheStore.clear();
  }
}

export const cacheProvider = new CacheProvider();
