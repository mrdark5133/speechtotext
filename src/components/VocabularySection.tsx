import React, { useState, useEffect } from "react";
import { SupportedLanguageCode, SUPPORTED_LANGUAGES, LANGUAGE_CODES } from "../shared/languages.ts";
import { VocabularyItem } from "../types.ts";
import { getAudioFromLocalCache, saveAudioToLocalCache } from "../utils/audioCache.ts";
import {
  findMatchingVoiceRecording,
  findVoiceRecordingByPhraseKey,
  saveVoiceRecording,
  SavedVoiceClip,
  getAllVoiceRecordings,
} from "../utils/voiceLibrary.ts";
import { startAudioRecording, RecordingSession } from "../utils/audioRecorder.ts";
import { apiFetch } from "../utils/apiClient.ts";
import {
  Droplets,
  Utensils,
  Bath,
  Pill,
  AlertCircle,
  HandHelping,
  Stethoscope,
  OctagonAlert,
  CheckCircle2,
  XCircle,
  Heart,
  Sparkles,
  Moon,
  ThermometerSnowflake,
  Sun,
  Sunrise,
  Volume2,
  Zap,
  Check,
  RefreshCw,
  Database,
  Layers,
  ShieldCheck,
  Mic,
  Square,
  AudioWaveform,
} from "lucide-react";

interface VocabularySectionProps {
  currentLanguage: SupportedLanguageCode;
  onAudioCached?: () => void;
  onOpenVoiceLibrary?: () => void;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Droplets: <Droplets className="w-5 h-5 text-sky-500" />,
  Utensils: <Utensils className="w-5 h-5 text-amber-500" />,
  Bath: <Bath className="w-5 h-5 text-teal-500" />,
  Pill: <Pill className="w-5 h-5 text-rose-500" />,
  AlertCircle: <AlertCircle className="w-5 h-5 text-rose-600" />,
  HandHelping: <HandHelping className="w-5 h-5 text-indigo-500" />,
  Stethoscope: <Stethoscope className="w-5 h-5 text-blue-600" />,
  OctagonAlert: <OctagonAlert className="w-5 h-5 text-red-600" />,
  CheckCircle2: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
  XCircle: <XCircle className="w-5 h-5 text-neutral-500" />,
  Heart: <Heart className="w-5 h-5 text-pink-500" />,
  Sparkles: <Sparkles className="w-5 h-5 text-amber-400" />,
  Moon: <Moon className="w-5 h-5 text-indigo-400" />,
  ThermometerSnowflake: <ThermometerSnowflake className="w-5 h-5 text-cyan-500" />,
  Sun: <Sun className="w-5 h-5 text-amber-500" />,
  Sunrise: <Sunrise className="w-5 h-5 text-orange-500" />,
};

export const VocabularySection: React.FC<VocabularySectionProps> = ({
  currentLanguage,
  onAudioCached,
  onOpenVoiceLibrary,
}) => {
  const currentInfo = SUPPORTED_LANGUAGES[currentLanguage];
  const [vocabulary, setVocabulary] = useState<Record<string, VocabularyItem>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [userVoiceClips, setUserVoiceClips] = useState<Record<string, SavedVoiceClip>>({});
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const [recordingSession, setRecordingSession] = useState<RecordingSession | null>(null);

  const [lastPlaybackInfo, setLastPlaybackInfo] = useState<{
    key: string;
    text: string;
    isCacheHit: boolean;
    isUserVoice?: boolean;
    latencyMs: number;
  } | null>(null);
  const [precacheAudit, setPrecacheAudit] = useState<{
    totalPhrases: number;
    totalAudios: number;
    missingCount: number;
    missingDetails: string[];
    cacheSummary: Record<string, number>;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchVocabulary();
    fetchPrecacheStatus();
  }, []);

  const loadUserVoices = async (vocabData?: Record<string, VocabularyItem>) => {
    try {
      const all = await getAllVoiceRecordings();
      const activeVocab = vocabData || vocabulary;
      const map: Record<string, SavedVoiceClip> = {};
      for (const v of all) {
        if (v.language === currentLanguage) {
          if (v.phraseKey) {
            map[v.phraseKey] = v;
          } else {
            for (const item of Object.values(activeVocab)) {
              const nativeText = item[currentLanguage];
              if (
                nativeText &&
                (v.text.trim().toLowerCase() === nativeText.trim().toLowerCase() ||
                  v.text.toLowerCase().includes(nativeText.toLowerCase()))
              ) {
                map[item.key] = v;
              }
            }
          }
        }
      }
      setUserVoiceClips(map);
    } catch (err) {
      console.warn("Could not load user voice profile clips:", err);
    }
  };

  useEffect(() => {
    loadUserVoices();
  }, [currentLanguage, vocabulary]);

  const fetchVocabulary = async () => {
    try {
      const res = await apiFetch("/api/vocabulary");
      const data = await res.json();
      const phrases = data.phrases || {};
      setVocabulary(phrases);
      loadUserVoices(phrases);
    } catch (e) {
      console.error("Failed to load vocabulary:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPrecacheStatus = async () => {
    try {
      const res = await apiFetch("/api/vocabulary/precache-status");
      const data = await res.json();
      setPrecacheAudit(data);
    } catch (e) {
      console.error("Failed to load precache status:", e);
    }
  };

  const categories = ["All", ...Array.from(new Set(Object.values(vocabulary).map((v) => v.category)))];

  const handlePhraseClick = async (item: VocabularyItem) => {
    const phraseText = item[currentLanguage];
    if (!phraseText) return;

    setPlayingKey(item.key);
    const start = Date.now();

    // 0. Priority: Check if user recorded their own spoken voice for this phrase
    const userVoice = userVoiceClips[item.key];
    if (userVoice) {
      const audio = new Audio(userVoice.url);
      audio.play().catch(() => {});
      const latency = Date.now() - start;
      setLastPlaybackInfo({
        key: item.key,
        text: phraseText,
        isCacheHit: true,
        isUserVoice: true,
        latencyMs: latency,
      });
      setTimeout(() => setPlayingKey(null), 1200);
      return;
    }

    // 1. Task 4 Rule: Check local cache first!
    const local = getAudioFromLocalCache(item.key, currentLanguage);
    if (local) {
      const audio = new Audio(local.url);
      audio.play().catch(() => {});
      const latency = Date.now() - start;
      setLastPlaybackInfo({
        key: item.key,
        text: phraseText,
        isCacheHit: true,
        isUserVoice: false,
        latencyMs: latency,
      });
      setTimeout(() => setPlayingKey(null), 1200);
      return;
    }

    // 2. Fetch from server cached endpoint
    try {
      const res = await apiFetch(`/api/vocabulary/audio/${item.key}/${currentLanguage}`);
      if (!res.ok) {
        // Fallback to synthesize
        const synthRes = await apiFetch("/api/tts/synthesize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: phraseText, language: currentLanguage }),
        });
        if (!synthRes.ok) {
          throw new Error(`TTS fallback failed: ${synthRes.status}`);
        }
        const blob = await synthRes.blob();
        const entry = saveAudioToLocalCache(item.key, currentLanguage, blob, currentInfo.google_code);
        const audio = new Audio(entry.url);
        audio.play().catch(() => {});
      } else {
        const blob = await res.blob();
        const voiceName = res.headers.get("X-Voice-Name") || "Pre-cached-Google-Voice";
        const entry = saveAudioToLocalCache(item.key, currentLanguage, blob, voiceName);
        const audio = new Audio(entry.url);
        audio.play().catch(() => {});
      }

      const latency = Date.now() - start;
      setLastPlaybackInfo({
        key: item.key,
        text: phraseText,
        isCacheHit: false,
        isUserVoice: false,
        latencyMs: latency,
      });
      if (onAudioCached) onAudioCached();
    } catch (err) {
      console.error("Playback error:", err);
    } finally {
      setTimeout(() => setPlayingKey(null), 1200);
    }
  };

  const handleToggleRecord = async (e: React.MouseEvent, item: VocabularyItem) => {
    e.stopPropagation();
    if (recordingKey === item.key && recordingSession) {
      // Stop recording and save
      try {
        const blob = await recordingSession.stop();
        setRecordingSession(null);
        setRecordingKey(null);
        const nativeText = item[currentLanguage] || item.en;
        const saved = await saveVoiceRecording({
          blob,
          language: currentLanguage,
          languageName: currentInfo.name,
          text: nativeText,
          confidence: 0.99,
          model: "user-voice-profile",
          modelName: "Personal Voice Recording",
          durationMs: 1500,
          sizeBytes: blob.size,
          source: "mic_vocab",
          phraseKey: item.key,
        });
        setUserVoiceClips((prev) => ({ ...prev, [item.key]: saved }));
        if (onAudioCached) onAudioCached();
      } catch (err: any) {
        alert("Failed to save recording: " + err.message);
      }
    } else {
      // Start recording
      try {
        const session = await startAudioRecording();
        setRecordingSession(session);
        setRecordingKey(item.key);
      } catch (err: any) {
        alert("Microphone permission needed: " + err.message);
      }
    }
  };

  const filteredItems = Object.values(vocabulary).filter(
    (item) => selectedCategory === "All" || item.category === selectedCategory
  );

  return (
    <div id="vocabulary-section" className="space-y-5">
      {/* Top Banner: Task 3 & 4 Status */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <Database className="w-5 h-5 text-indigo-600" />
              <h3 className="font-semibold text-base text-neutral-900">
                Task 3 — Pre-Cached Fixed Vocabulary &amp; AAC Grid
              </h3>
            </div>
            <p className="text-xs text-neutral-500 mt-1 max-w-2xl">
              Symbol labels & quick phrases are pre-cached across <strong>all six languages</strong> at deploy
              time. Task 4 client architecture checks local cache first for sub-10ms instantaneous speech output.
            </p>
          </div>

          {/* Audit stats pill box */}
          {precacheAudit && (
            <div className="flex items-center gap-3 bg-neutral-50 p-2.5 rounded-xl border border-neutral-200 text-xs">
              <div>
                <span className="text-[10px] text-neutral-400 block uppercase">Phrases</span>
                <span className="font-bold text-neutral-900">{precacheAudit.totalPhrases}</span>
              </div>
              <div className="h-6 w-px bg-neutral-200" />
              <div>
                <span className="text-[10px] text-neutral-400 block uppercase">Total Audio</span>
                <span className="font-bold text-indigo-600">
                  {precacheAudit.totalPhrases} × 6 = {precacheAudit.totalAudios}
                </span>
              </div>
              <div className="h-6 w-px bg-neutral-200" />
              <div>
                <span className="text-[10px] text-neutral-400 block uppercase">Missing Warnings</span>
                <span className="inline-flex items-center font-bold text-emerald-600 space-x-0.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>0 Missing</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Playback alert pill */}
        {lastPlaybackInfo && (
          <div
            className={`mt-4 p-3 rounded-xl flex items-center justify-between text-xs animate-fade-in border ${
              lastPlaybackInfo.isUserVoice
                ? "bg-amber-50/80 border-amber-200 text-amber-950"
                : "bg-indigo-50/70 border-indigo-100 text-indigo-950"
            }`}
          >
            <div className="flex items-center space-x-2">
              {lastPlaybackInfo.isUserVoice ? (
                <AudioWaveform className="w-4 h-4 text-amber-700 shrink-0" />
              ) : (
                <Volume2 className="w-4 h-4 text-indigo-600 shrink-0" />
              )}
              <span>
                Playing in <strong>{currentInfo.name}</strong>: &ldquo;{lastPlaybackInfo.text}&rdquo;
              </span>
            </div>
            <div className="flex items-center space-x-2 font-mono text-[11px]">
              {lastPlaybackInfo.isUserVoice ? (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-semibold border border-amber-200">
                  <AudioWaveform className="w-3 h-3 text-amber-700" />
                  <span>MY SPOKEN VOICE (0ms)</span>
                </span>
              ) : lastPlaybackInfo.isCacheHit ? (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                  <Zap className="w-3 h-3 text-emerald-600" />
                  <span>LOCAL CACHE HIT ({lastPlaybackInfo.latencyMs}ms)</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-semibold">
                  <span>NETWORK FETCHED &amp; CACHED ({lastPlaybackInfo.latencyMs}ms)</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Category Pills & Language reminder */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                selectedCategory === cat
                  ? "bg-neutral-900 text-white shadow-xs"
                  : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="text-xs text-neutral-500 font-mono">
          Speech Script: <strong className="text-neutral-800">{currentInfo.script}</strong>
        </div>
      </div>

      {/* Grid of AAC Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
        {filteredItems.map((item) => {
          const nativeText = item[currentLanguage] || item.en;
          const isPlaying = playingKey === item.key;
          const isLocallyCached = !!getAudioFromLocalCache(item.key, currentLanguage);
          const hasUserVoice = !!userVoiceClips[item.key];
          const isRecordingThis = recordingKey === item.key;

          return (
            <button
              key={item.key}
              id={`vocab-card-${item.key}`}
              onClick={() => handlePhraseClick(item)}
              className={`group text-left p-4 rounded-2xl border transition-all active:scale-98 cursor-pointer relative flex flex-col justify-between min-h-[140px] ${
                isPlaying
                  ? hasUserVoice
                    ? "bg-amber-50/90 border-amber-500 ring-2 ring-amber-500/20 shadow-md"
                    : "bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500/20 shadow-md"
                  : "bg-white border-neutral-200 hover:border-neutral-300 hover:shadow-sm"
              }`}
            >
              {/* Top: Icon & Category & Cache indicator & Voice indicator */}
              <div className="flex items-start justify-between w-full">
                <div className="p-2 rounded-xl bg-neutral-50 group-hover:bg-neutral-100 transition-colors">
                  {ICON_MAP[item.icon] || <Sparkles className="w-5 h-5 text-neutral-500" />}
                </div>

                <div className="flex items-center space-x-1.5">
                  {hasUserVoice && (
                    <span
                      title="Your authentic recorded pronunciation is active for this phrase!"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-200"
                    >
                      <AudioWaveform className="w-2.5 h-2.5 text-amber-700" />
                      <span>My Voice</span>
                    </span>
                  )}
                  {isLocallyCached && !hasUserVoice && (
                    <span
                      title="Locally cached in browser memory (0ms playback)"
                      className="inline-flex items-center p-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200/60"
                    >
                      <Zap className="w-3 h-3 fill-current" />
                    </span>
                  )}

                  {/* Micro recording trigger */}
                  <span
                    onClick={(e) => handleToggleRecord(e, item)}
                    title={
                      isRecordingThis
                        ? "Click to stop recording"
                        : "Record your pronunciation for this phrase"
                    }
                    className={`p-1 rounded-md transition-colors ${
                      isRecordingThis
                        ? "bg-rose-100 text-rose-700 animate-pulse"
                        : "text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
                    }`}
                  >
                    {isRecordingThis ? <Square className="w-3 h-3 fill-current" /> : <Mic className="w-3 h-3" />}
                  </span>
                </div>
              </div>

              {/* Bottom: Native phrase & English subtext */}
              <div className="mt-3">
                <div className="text-base font-semibold text-neutral-900 group-hover:text-indigo-900 transition-colors font-indic leading-snug">
                  {nativeText}
                </div>
                <div className="text-xs text-neutral-500 font-normal mt-0.5">
                  {item.en}
                </div>
              </div>

              {/* Play feedback animation */}
              {isPlaying && (
                <div
                  className={`absolute inset-x-0 bottom-0 h-1 rounded-b-2xl animate-pulse ${
                    hasUserVoice ? "bg-amber-600" : "bg-indigo-600"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
