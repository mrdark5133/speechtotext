export interface LanguageConfig {
  code: string;
  name: string;
  nativeName: string;
  whisper_name: string;
  google_code: string;
  script: string;
  samplePhrase: string;
  sampleTranslation: string;
  defaultVoice: string;
}

export const SUPPORTED_LANGUAGES: Record<string, LanguageConfig> = {
  en: {
    code: "en",
    name: "English",
    nativeName: "English",
    whisper_name: "english",
    google_code: "en-IN",
    script: "Latin",
    samplePhrase: "I need water",
    sampleTranslation: "I need water",
    defaultVoice: "en-IN-Neural2-B",
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
    defaultVoice: "hi-IN-Neural2-A",
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
    defaultVoice: "ta-IN-Neural2-A",
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
    defaultVoice: "te-IN-Standard-A",
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
    defaultVoice: "kn-IN-Standard-A",
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
    defaultVoice: "bn-IN-Wavenet-A",
  },
};

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES;
