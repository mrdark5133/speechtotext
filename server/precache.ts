import fs from "fs";
import path from "path";
import { SUPPORTED_LANGUAGES } from "./languages.ts";
import { synthesizeSpeech } from "./tts.ts";

export interface VocabularyPhrase {
  key: string;
  category: string;
  icon: string;
  en: string;
  hi: string;
  ta: string;
  te: string;
  kn: string;
  bn: string;
  [key: string]: string;
}

// In-memory audio buffer cache: key: `${phraseKey}_${langCode}` -> Buffer
const _audioMemoryCache: Map<string, { buffer: Buffer; voice: string; length: number }> = new Map();

export function loadFixedVocabulary(): Record<string, VocabularyPhrase> {
  const filePath = path.join(process.cwd(), "data", "fixed_vocabulary.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

/**
 * Pre-cache all vocabulary phrases across all 6 languages.
 * Validates that every phrase has non-empty translations for all six languages.
 */
export async function precacheAllVocabulary(): Promise<{
  totalPhrases: number;
  totalAudios: number;
  missingCount: number;
  missingDetails: string[];
  cacheSummary: { [lang: string]: number };
}> {
  const phrases = loadFixedVocabulary();
  const phraseKeys = Object.keys(phrases);
  const langCodes = Object.keys(SUPPORTED_LANGUAGES);
  
  let missingCount = 0;
  const missingDetails: string[] = [];
  const cacheSummary: { [lang: string]: number } = {};

  for (const lang of langCodes) {
    cacheSummary[lang] = 0;
  }

  for (const key of phraseKeys) {
    const phraseData = phrases[key];
    for (const lang of langCodes) {
      const text = phraseData[lang];
      if (!text || text.trim() === "") {
        console.warn(`WARNING: missing ${lang} translation for '${key}'`);
        missingCount++;
        missingDetails.push(`Missing translation for phrase '${key}' in language '${lang}'`);
        continue;
      }

      const cacheKey = `${key}_${lang}`;
      if (!_audioMemoryCache.has(cacheKey)) {
        const { buffer, voiceName } = await synthesizeSpeech(text, lang, 1.0);
        _audioMemoryCache.set(cacheKey, {
          buffer,
          voice: voiceName,
          length: buffer.length,
        });
      }
      cacheSummary[lang]++;
    }
  }

  console.log(
    `[precache] Verified fixed vocabulary: ${phraseKeys.length} phrases across ${langCodes.length} languages (${_audioMemoryCache.size} audio units cached). Missing translations: ${missingCount}`
  );

  return {
    totalPhrases: phraseKeys.length,
    totalAudios: _audioMemoryCache.size,
    missingCount,
    missingDetails,
    cacheSummary,
  };
}

export function getCachedAudio(phraseKey: string, langCode: string) {
  const cacheKey = `${phraseKey}_${langCode}`;
  return _audioMemoryCache.get(cacheKey) || null;
}
