export interface LanguageInfo {
  code: string;
  name: string;
  nativeName: string;
  whisper_name: string;
  google_code: string;
  script: string;
  samplePhrase: string;
  sampleTranslation: string;
}

/**
 * SUPPORTED_LANGUAGES is the single source of truth across both ASR and TTS routers,
 * client UI, and vocabulary cache engines.
 * 
 * Languages:
 * 1. English (en) -> Whisper: english -> Google TTS: en-IN
 * 2. Hindi (hi)   -> Whisper: hindi   -> Google TTS: hi-IN
 * 3. Tamil (ta)   -> Whisper: tamil   -> Google TTS: ta-IN
 * 4. Telugu (te)  -> Whisper: telugu  -> Google TTS: te-IN
 * 5. Kannada (kn) -> Whisper: kannada -> Google TTS: kn-IN
 * 6. Bengali (bn) -> Whisper: bengali -> Google TTS: bn-IN
 */
export const SUPPORTED_LANGUAGES: Record<string, LanguageInfo> = {
  en: {
    code: "en",
    name: "English",
    nativeName: "English",
    whisper_name: "english",
    google_code: "en-IN",
    script: "Latin",
    samplePhrase: "I need water",
    sampleTranslation: "I need water",
  },
  hi: {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    whisper_name: "hindi",
    google_code: "hi-IN",
    script: "Devanagari",
    samplePhrase: "मुझे पानी चाहिए",
    sampleTranslation: "I need water",
  },
  ta: {
    code: "ta",
    name: "Tamil",
    nativeName: "தமிழ்",
    whisper_name: "tamil",
    google_code: "ta-IN",
    script: "Tamil",
    samplePhrase: "எனக்கு தண்ணீர் வேண்டும்",
    sampleTranslation: "I need water",
  },
  te: {
    code: "te",
    name: "Telugu",
    nativeName: "తెలుగు",
    whisper_name: "telugu",
    google_code: "te-IN",
    script: "Telugu",
    samplePhrase: "నాకు నీళ్ళు కావాలి",
    sampleTranslation: "I need water",
  },
  kn: {
    code: "kn",
    name: "Kannada",
    nativeName: "ಕನ್ನಡ",
    whisper_name: "kannada",
    google_code: "kn-IN",
    script: "Kannada",
    samplePhrase: "ನನಗೆ ನೀರು ಬೇಕು",
    sampleTranslation: "I need water",
  },
  bn: {
    code: "bn",
    name: "Bengali",
    nativeName: "বাংলা",
    whisper_name: "bengali",
    google_code: "bn-IN",
    script: "Bengali",
    samplePhrase: "আমার জল দরকার",
    sampleTranslation: "I need water",
  },
};

export type SupportedLanguageCode = "en" | "hi" | "ta" | "te" | "kn" | "bn";

export const LANGUAGE_CODES: SupportedLanguageCode[] = ["en", "hi", "ta", "te", "kn", "bn"];
