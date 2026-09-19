import { SupportedLanguageCode } from "./shared/languages.ts";

export interface LanguageItem {
  code: SupportedLanguageCode;
  name: string;
  nativeName: string;
  whisper_name: string;
  google_code: string;
  script: string;
  samplePhrase: string;
  sampleTranslation: string;
  defaultVoice?: string;
}

export interface VocabularyItem {
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

export interface AsrModelInfo {
  id: string;
  name: string;
  checkpoint: string;
  parameters: string;
  architecture: string;
  organization: string;
  recommendedFor: string;
  hfUrl: string;
}

export interface AsrSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

export interface AsrResponse {
  text: string;
  language: string;
  whisper_language: string;
  confidence: number;
  segments?: AsrSegment[];  // per-segment confidence from faster-whisper
  model: string;
  model_name?: string;
  architecture?: string;
  device?: string;
  latency_ms?: number;
  duration_ms?: number;
}

export interface TtsResponseInfo {
  voiceName: string;
  googleCode: string;
  language: string;
  audioBlob: Blob;
  audioUrl: string;
  durationSeconds: number;
  sizeBytes: number;
}

export interface LanguageTestDetail {
  code: string;
  languageName: string;
  googleCode?: string;
  voiceName?: string;
  whisperLanguage?: string;
  transcribedText?: string;
  audioLengthBytes?: number;
  confidence?: number;
  latencyMs: number;
  status: "passed" | "failed";
}

export interface TestSuiteResults {
  timestamp: string;
  startupVoiceCheck: Record<string, { google_code: string; voice: string; status: string }>;
  vocabularyAudit: {
    totalPhrases: number;
    totalAudios: number;
    missingCount: number;
    missingDetails: string[];
    cacheSummary: Record<string, number>;
  };
  asrResults: Record<string, LanguageTestDetail>;
  ttsResults: Record<string, LanguageTestDetail>;
  allPassed: boolean;
}
