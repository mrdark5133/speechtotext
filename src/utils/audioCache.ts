/**
 * Client-Side Audio Cache Engine (Task 4: Checks local cache first for TTS)
 * Implements in-memory and Blob caching for instant zero-latency speech playback.
 */

interface CacheEntry {
  blob: Blob;
  url: string;
  voiceName: string;
  cachedAt: number;
}

const localCache = new Map<string, CacheEntry>();

export function getAudioFromLocalCache(key: string, langCode: string): CacheEntry | null {
  const cacheKey = `${key}_${langCode}`;
  return localCache.get(cacheKey) || null;
}

export function saveAudioToLocalCache(
  key: string,
  langCode: string,
  blob: Blob,
  voiceName: string
): CacheEntry {
  const cacheKey = `${key}_${langCode}`;
  const existing = localCache.get(cacheKey);
  if (existing) {
    URL.revokeObjectURL(existing.url);
  }
  const url = URL.createObjectURL(blob);
  const entry: CacheEntry = {
    blob,
    url,
    voiceName,
    cachedAt: Date.now(),
  };
  localCache.set(cacheKey, entry);
  return entry;
}

export function getLocalCacheSize(): number {
  return localCache.size;
}

export function clearLocalAudioCache(): void {
  for (const entry of localCache.values()) {
    URL.revokeObjectURL(entry.url);
  }
  localCache.clear();
}
