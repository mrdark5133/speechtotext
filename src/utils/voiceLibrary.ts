/**
 * Voice Library & Personal Acoustic Profile Engine
 * Uses IndexedDB to store audio recordings persistently across sessions,
 * enabling voice re-use in Text-to-Speech and personalized acoustic conditioning for ASR.
 */

export interface SavedVoiceClip {
  id: string;
  blob: Blob;
  url: string;
  language: string; // 'en', 'hi', 'ta', 'te', 'kn', 'bn'
  languageName: string;
  text: string;
  confidence: number;
  model: string;
  modelName: string;
  durationMs: number;
  timestamp: number;
  sizeBytes: number;
  source: "mic_asr" | "mic_vocab" | "tts_custom" | "preset";
  tags?: string[];
  isCustomPronunciation?: boolean;
  phraseKey?: string;
}

const DB_NAME = "indic_voice_library_db";
const DB_VERSION = 1;
const STORE_NAME = "saved_voices";

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB not available in current environment"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("language", "language", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("text", "text", { unique: false });
        store.createIndex("phraseKey", "phraseKey", { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });

  return dbPromise;
}

// In-memory URL cache to prevent memory leaks while keeping audio playable
const activeBlobUrls = new Map<string, string>();

export function getOrCreateBlobUrl(id: string, blob: Blob): string {
  if (activeBlobUrls.has(id)) {
    return activeBlobUrls.get(id)!;
  }
  const url = URL.createObjectURL(blob);
  activeBlobUrls.set(id, url);
  return url;
}

/**
 * Saves a spoken voice clip into IndexedDB
 */
export async function saveVoiceRecording(
  data: Omit<SavedVoiceClip, "id" | "timestamp" | "url"> & { id?: string }
): Promise<SavedVoiceClip> {
  const db = await getDB();
  const id = data.id || `vrec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = Date.now();
  const url = getOrCreateBlobUrl(id, data.blob);

  const entry: SavedVoiceClip = {
    ...data,
    id,
    timestamp,
    url,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // IndexedDB stores raw Blobs natively
    const recordToStore = {
      ...entry,
      url: "", // Don't persist temporary blob URL
    };

    const req = store.put(recordToStore);
    req.onsuccess = () => {
      resolve(entry);
    };
    req.onerror = () => {
      reject(req.error);
    };
  });
}

/**
 * Retrieves all saved voice clips, newest first
 */
export async function getAllVoiceRecordings(): Promise<SavedVoiceClip[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const raw = (req.result || []) as SavedVoiceClip[];
        const items = raw.map((item) => ({
          ...item,
          url: getOrCreateBlobUrl(item.id, item.blob),
        }));
        // Sort newest first
        items.sort((a, b) => b.timestamp - a.timestamp);
        resolve(items);
      };

      req.onerror = () => {
        reject(req.error);
      };
    });
  } catch (e) {
    console.warn("Could not retrieve voice recordings from IndexedDB:", e);
    return [];
  }
}

/**
 * Finds a saved voice recording matching the given text and language (for TTS voice matching)
 */
export async function findMatchingVoiceRecording(
  targetText: string,
  language: string
): Promise<SavedVoiceClip | null> {
  if (!targetText || !targetText.trim()) return null;
  const all = await getAllVoiceRecordings();
  const normalizedTarget = targetText.trim().toLowerCase();

  // 1. Exact match
  const exact = all.find(
    (item) => item.language === language && item.text.trim().toLowerCase() === normalizedTarget
  );
  if (exact) return exact;

  // 2. Substring or contains match
  const contains = all.find(
    (item) =>
      item.language === language &&
      (item.text.trim().toLowerCase().includes(normalizedTarget) ||
        normalizedTarget.includes(item.text.trim().toLowerCase()))
  );
  return contains || null;
}

/**
 * Finds a saved recording specifically recorded for a phrasebook item
 */
export async function findVoiceRecordingByPhraseKey(
  phraseKey: string,
  language: string
): Promise<SavedVoiceClip | null> {
  const all = await getAllVoiceRecordings();
  return (
    all.find(
      (item) => item.phraseKey === phraseKey && item.language === language
    ) || null
  );
}

/**
 * Deletes a voice recording by ID
 */
export async function deleteVoiceRecording(id: string): Promise<void> {
  const db = await getDB();
  if (activeBlobUrls.has(id)) {
    URL.revokeObjectURL(activeBlobUrls.get(id)!);
    activeBlobUrls.delete(id);
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Clears all voice recordings
 */
export async function clearAllVoiceRecordings(): Promise<void> {
  const db = await getDB();
  for (const url of activeBlobUrls.values()) {
    URL.revokeObjectURL(url);
  }
  activeBlobUrls.clear();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Extracts acoustic vocabulary hints from the user's spoken voice library
 * to condition and bias the ASR engine toward the user's authentic speech patterns.
 */
export async function getAcousticVocabularyHints(language?: string): Promise<string[]> {
  try {
    const all = await getAllVoiceRecordings();
    const filtered = language ? all.filter((i) => i.language === language) : all;
    const uniquePhrases = Array.from(
      new Set(
        filtered
          .map((i) => i.text.trim())
          .filter((t) => t.length > 0 && t.length < 100)
      )
    );
    return uniquePhrases.slice(0, 15);
  } catch {
    return [];
  }
}
