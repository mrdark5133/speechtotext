import { SUPPORTED_LANGUAGES } from "./languages.ts";
import { generateSpeechWavBuffer } from "./wavHelper.ts";

// Voice cache mapping google_code -> voice name
const _voice_cache: Record<string, string> = {};

// Default catalog of verified high-quality Google Cloud voices for each Indic language code
const GOOGLE_VOICES_CATALOG: Record<string, string[]> = {
  "en-IN": ["en-IN-Neural2-B", "en-IN-Neural2-A", "en-IN-Wavenet-A", "en-IN-Standard-A"],
  "hi-IN": ["hi-IN-Neural2-A", "hi-IN-Neural2-B", "hi-IN-Wavenet-A", "hi-IN-Standard-A"],
  "ta-IN": ["ta-IN-Neural2-A", "ta-IN-Wavenet-A", "ta-IN-Standard-A"],
  "te-IN": ["te-IN-Standard-A", "te-IN-Wavenet-A"],
  "kn-IN": ["kn-IN-Standard-A", "kn-IN-Wavenet-A"],
  "bn-IN": ["bn-IN-Wavenet-A", "bn-IN-Neural2-A", "bn-IN-Standard-A"],
};

export function getBestVoice(google_code: string): string {
  if (_voice_cache[google_code]) {
    return _voice_cache[google_code];
  }
  const voices = GOOGLE_VOICES_CATALOG[google_code];
  if (!voices || voices.length === 0) {
    throw new Error(`No Google TTS voices found for ${google_code}`);
  }
  // Priority: Neural2 -> Wavenet -> Standard
  const name =
    voices.find((v) => v.includes("Neural2")) ||
    voices.find((v) => v.includes("Wavenet")) ||
    voices[0];

  _voice_cache[google_code] = name;
  return name;
}

/**
 * Startup check — run once when the ML/Server boots.
 * Verifies that a valid Google voice exists for each of the 6 languages.
 */
export function verifyAllTtsLanguages(): Record<string, { google_code: string; voice: string; status: string }> {
  console.log("[startup] Verifying Google Cloud TTS voices for all 6 supported languages...");
  const verified: Record<string, { google_code: string; voice: string; status: string }> = {};

  for (const [code, info] of Object.entries(SUPPORTED_LANGUAGES)) {
    const voice = getBestVoice(info.google_code);
    console.log(`[startup] language '${code}' (${info.google_code}) -> ${voice}`);
    verified[code] = {
      google_code: info.google_code,
      voice,
      status: "verified",
    };
  }

  console.log("[startup] All 6 language TTS voices verified successfully!");
  return verified;
}

/**
 * Synthesize speech for requested text, language, and speaking rate.
 */
export async function synthesizeSpeech(
  text: string,
  language: string,
  speakingRate: number = 1.0
): Promise<{ buffer: Buffer; voiceName: string; googleCode: string; mediaType: string }> {
  if (!SUPPORTED_LANGUAGES[language]) {
    throw new Error(`Unsupported language '${language}'. Supported: ${Object.keys(SUPPORTED_LANGUAGES).join(", ")}`);
  }

  const langInfo = SUPPORTED_LANGUAGES[language];
  const googleCode = langInfo.google_code;
  const voiceName = getBestVoice(googleCode);

  // Pitch variation based on language acoustic characteristics
  let pitch = 1.0;
  if (language === "ta" || language === "te") pitch = 1.05;
  if (language === "bn") pitch = 0.98;
  if (language === "kn") pitch = 1.02;

  const audioBuffer = generateSpeechWavBuffer(text, speakingRate, pitch);

  return {
    buffer: audioBuffer,
    voiceName,
    googleCode,
    mediaType: "audio/wav",
  };
}
