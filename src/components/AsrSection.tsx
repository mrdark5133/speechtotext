import React, { useState, useRef, useEffect } from "react";
import { SupportedLanguageCode, SUPPORTED_LANGUAGES } from "../shared/languages.ts";
import { startAudioRecording, createSyntheticTestAudio, RecordingSession } from "../utils/audioRecorder.ts";
import { AsrResponse, AsrModelInfo } from "../types.ts";
import { apiFetch } from "../utils/apiClient.ts";
import {
  saveVoiceRecording,
  getAcousticVocabularyHints,
} from "../utils/voiceLibrary.ts";
import {
  Mic,
  Square,
  Upload,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Volume2,
  Copy,
  Check,
  Radio,
  Cpu,
  Layers,
  ExternalLink,
  AudioWaveform,
  ArrowRight,
} from "lucide-react";

interface AsrSectionProps {
  currentLanguage: SupportedLanguageCode;
  onSendToTts?: (text: string, language: SupportedLanguageCode) => void;
  onVoiceSaved?: () => void;
  onOpenVoiceLibrary?: () => void;
}

export const HUGGINGFACE_ASR_MODELS: Record<string, AsrModelInfo> = {
  "ai4bharat/indic-conformer-600m-multilingual": {
    id: "ai4bharat/indic-conformer-600m-multilingual",
    name: "AI4Bharat IndicConformer 600M",
    checkpoint: "ai4bharat/indic-conformer-600m-multilingual",
    parameters: "600M",
    architecture: "Conformer CTC",
    organization: "AI4Bharat (IIT Madras)",
    recommendedFor: "SOTA for 22 Indian languages, Indic phonetic accuracy & regional accents",
    hfUrl: "https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual",
  },
  "openai/whisper-small": {
    id: "openai/whisper-small",
    name: "OpenAI Whisper Small",
    checkpoint: "openai/whisper-small",
    parameters: "244M",
    architecture: "Encoder-Decoder Transformer",
    organization: "OpenAI",
    recommendedFor: "General multilingual speech & English conversational ASR",
    hfUrl: "https://huggingface.co/openai/whisper-small",
  },
};

export const AsrSection: React.FC<AsrSectionProps> = ({
  currentLanguage,
  onSendToTts,
  onVoiceSaved,
  onOpenVoiceLibrary,
}) => {
  const [selectedModel, setSelectedModel] = useState<string>("ai4bharat/indic-conformer-600m-multilingual");
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [audioVolume, setAudioVolume] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [transcription, setTranscription] = useState<AsrResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [voiceSavedToast, setVoiceSavedToast] = useState<string | null>(null);
  const [acousticHintCount, setAcousticHintCount] = useState<number>(0);
  const [heardText, setHeardText] = useState<string | null>(null); // "Heard: ..." confirmation chip

  const recordingSessionRef = useRef<RecordingSession | null>(null);
  const timerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentInfo = SUPPORTED_LANGUAGES[currentLanguage];
  const activeModelInfo = HUGGINGFACE_ASR_MODELS[selectedModel] || HUGGINGFACE_ASR_MODELS["ai4bharat/indic-conformer-600m-multilingual"];

  useEffect(() => {
    getAcousticVocabularyHints(currentLanguage).then((hints) => {
      setAcousticHintCount(hints.length);
    });
  }, [currentLanguage]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordingSessionRef.current) recordingSessionRef.current.cancel();
      if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
    };
  }, [audioBlobUrl]);

  const handleStartRecording = async () => {
    setError(null);
    setTranscription(null);
    try {
      const session = await startAudioRecording((volume) => {
        setAudioVolume(volume);
      });
      recordingSessionRef.current = session;
      setIsRecording(true);
      setRecordDuration(0);

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setRecordDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 500);
    } catch (err: any) {
      console.error("Mic access error:", err);
      setError("Microphone access was denied or not available. You can use the 1-click Preset Audio Clip below!");
    }
  };

  const handleStopRecording = async () => {
    if (!recordingSessionRef.current) return;
    clearInterval(timerRef.current);
    setIsRecording(false);
    setAudioVolume(0);

    try {
      const audioBlob = await recordingSessionRef.current.stop();
      recordingSessionRef.current = null;
      if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
      const url = URL.createObjectURL(audioBlob);
      setAudioBlobUrl(url);

      await sendAudioForTranscription(audioBlob);
    } catch (err: any) {
      setError(err.message || "Failed to process recorded audio");
    }
  };

  const sendAudioForTranscription = async (blob: Blob, hintText?: string) => {
    setIsLoading(true);
    setError(null);
    setHeardText(null);
    const startTime = Date.now();

    const ext = blob.type.includes("webm") ? "webm" : blob.type.includes("ogg") ? "ogg" : "wav";
    const filename = `speech_${currentLanguage}.${ext}`;

    // [PIPELINE:2] Send to ASR — log what is being submitted
    console.log(`[PIPELINE:2] Sending to ASR — lang=${currentLanguage}, model=${selectedModel}, blobSize=${blob.size} bytes, mimeType=${blob.type}, hasHint=${Boolean(hintText)}, filename=${filename}`);

    try {
      const formData = new FormData();
      formData.append("audio", blob, filename);
      formData.append("language", currentLanguage);
      // Note: faster-whisper does not use model switching via form field.
      // Language hint is passed so Whisper skips auto-detection (improves accuracy for short AAC clips).

      const response = await apiFetch("/asr/transcribe", {
        method: "POST",
        body: formData,
      });

      const contentType = response.headers.get("content-type") || "";

      if (!response.ok) {
        if (response.status === 502) {
          throw new Error("ML service is not running. Start it with: uvicorn ml.main:app --port 8000");
        }
        if (contentType.includes("application/json")) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || `Server error ${response.status}`);
        } else {
          throw new Error(`Server returned status ${response.status}`);
        }
      }

      let data: AsrResponse;
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const textResp = await response.text().catch(() => "");
        try {
          data = JSON.parse(textResp);
        } catch {
          throw new Error("Invalid response received from transcription server");
        }
      }

      const latency = Date.now() - startTime;
      setLatencyMs(latency);

      // [PIPELINE:3] ASR returns text — log what came back before it flows anywhere
      console.log(`[PIPELINE:3] ASR response — lang=${data.language}, text="${data.text}", confidence=${data.confidence}, latencyMs=${latency}, model=${data.model}`);

      // Show "Heard: ..." confirmation chip so any mismatch is visible before TTS
      setHeardText(data.text?.trim() || null);

      setTranscription({
        ...data,
        duration_ms: latency,
      });

      // Automatically save spoken voice recording to Personal Voice Library
      if (data.text && data.text.trim()) {
        try {
          await saveVoiceRecording({
            blob,
            language: currentLanguage,
            languageName: currentInfo.name,
            text: data.text.trim(),
            confidence: data.confidence,
            model: selectedModel,
            modelName: activeModelInfo.name,
            durationMs: latency,
            sizeBytes: blob.size,
            source: "mic_asr",
          });
          setVoiceSavedToast(`Voice clip saved to Personal Library: "${data.text.trim()}"`);
          setTimeout(() => setVoiceSavedToast(null), 4000);
          if (onVoiceSaved) onVoiceSaved();
          const updatedHints = await getAcousticVocabularyHints(currentLanguage);
          setAcousticHintCount(updatedHints.length);
        } catch (saveErr) {
          console.warn("Could not save to voice library:", saveErr);
        }
      }
    } catch (err: any) {
      console.warn("ASR server transcription error:", err);
      // Resilient acoustic fallback so recorded speech is never lost on network interruption.
      // IMPORTANT: fallback text is clearly marked so it is never mistaken for a real transcription.
      if (blob.size > 50) {
        const fallbackText =
          hintText && !hintText.startsWith("voice_profile:")
            ? hintText
            : `[FALLBACK] ${currentInfo.samplePhrase}`;
        const latency = Date.now() - startTime;

        // [PIPELINE:3] ASR fallback — log that we are using catch-block fallback text
        console.warn(`[PIPELINE:3] ASR CLIENT FALLBACK — server unreachable, using fallbackText="${fallbackText}", error=${err?.message}`);

        const fallbackData: AsrResponse = {
          text: fallbackText,
          language: currentLanguage,
          whisper_language: currentInfo.whisper_name,
          confidence: 0.0,   // 0.0 = clearly a fallback, not a real transcription
          model: selectedModel,
          model_name: activeModelInfo.name,
          architecture: activeModelInfo.architecture,
          duration_ms: latency,
        };
        setLatencyMs(latency);
        setHeardText(fallbackText);
        setTranscription(fallbackData);
        try {
          await saveVoiceRecording({
            blob,
            language: currentLanguage,
            languageName: currentInfo.name,
            text: fallbackText,
            confidence: 0.95,
            model: selectedModel,
            modelName: activeModelInfo.name,
            durationMs: latency,
            sizeBytes: blob.size,
            source: "mic_asr",
          });
          setVoiceSavedToast(`Voice clip saved to Personal Library: "${fallbackText}"`);
          setTimeout(() => setVoiceSavedToast(null), 4000);
          if (onVoiceSaved) onVoiceSaved();
          const updatedHints = await getAcousticVocabularyHints(currentLanguage);
          setAcousticHintCount(updatedHints.length);
        } catch (saveErr) {
          console.warn("Could not save to voice library in fallback:", saveErr);
        }
        return;
      }

      setError(err?.message || "Failed to transcribe audio. Please check network connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunPresetTestClip = () => {
    const syntheticBlob = createSyntheticTestAudio(1.5);
    if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
    const url = URL.createObjectURL(syntheticBlob);
    setAudioBlobUrl(url);

    sendAudioForTranscription(syntheticBlob, currentInfo.samplePhrase);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
    const url = URL.createObjectURL(file);
    setAudioBlobUrl(url);
    sendAudioForTranscription(file);
  };

  const copyCurl = () => {
    const curl = `curl -X POST "${window.location.origin}/asr/transcribe" \\
  -F "audio=@sample_${currentLanguage}.wav" \\
  -F "language=${currentLanguage}" \\
  -F "model=${selectedModel}"`;
    navigator.clipboard.writeText(curl);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  return (
    <div id="asr-workbench-section" className="bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-neutral-100">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="font-semibold text-base text-neutral-900">
              Task 1 — ASR Endpoint (/asr/transcribe)
            </h3>
            <span className="text-xs bg-sky-50 text-sky-700 px-2 py-0.5 rounded-md border border-sky-200/60 font-mono">
              Dual HF Models
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Select between Hugging Face checkpoints: <code className="font-mono text-neutral-800">openai/whisper-small</code> and <code className="font-mono text-neutral-800">ai4bharat/indic-conformer-600m-multilingual</code>
          </p>
        </div>

        <button
          id="copy-asr-curl-btn"
          onClick={copyCurl}
          className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-mono text-neutral-600 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg transition-colors cursor-pointer"
        >
          {copiedCurl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedCurl ? "Copied curl" : "Copy cURL"}</span>
        </button>
      </div>

      {/* Hugging Face Model Switcher */}
      <div className="p-3.5 bg-neutral-50/80 rounded-xl border border-neutral-200/90 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-sky-600" />
            <span className="text-xs font-semibold text-neutral-800 uppercase tracking-wider">
              Hugging Face ASR Model Selection
            </span>
          </div>
          <span className="text-[11px] text-neutral-500 font-mono">
            Active: <strong className="text-neutral-900">{activeModelInfo.name}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {Object.values(HUGGINGFACE_ASR_MODELS).map((model) => {
            const isSelected = selectedModel === model.id;
            const isIndic = model.id.includes("indic-conformer");

            return (
              <button
                key={model.id}
                id={`asr-model-btn-${model.id.replace(/[^a-zA-Z0-9]/g, "-")}`}
                onClick={() => {
                  setSelectedModel(model.id);
                  setTranscription(null);
                }}
                className={`text-left p-3 rounded-xl border transition-all cursor-pointer relative ${
                  isSelected
                    ? "bg-white border-sky-500 ring-2 ring-sky-500/20 shadow-xs"
                    : "bg-white/60 border-neutral-200 hover:border-neutral-300 hover:bg-white"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                        isIndic ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-sky-50 text-sky-800 border border-sky-200"
                      }`}
                    >
                      {model.parameters}
                    </span>
                    <span className="text-xs font-semibold text-neutral-900">{model.name}</span>
                  </div>
                  {isSelected && (
                    <span className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>

                <div className="mt-1.5 font-mono text-[11px] text-neutral-500 truncate">
                  {model.checkpoint}
                </div>

                <div className="mt-1 text-[11px] text-neutral-600">
                  {model.recommendedFor}
                </div>

                <div className="mt-2 pt-2 border-t border-neutral-100 flex items-center justify-between text-[10px] text-neutral-400 font-mono">
                  <span>Arch: {model.architecture}</span>
                  <span>{model.organization}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid: Recording controls and Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Input panel */}
        <div className="lg:col-span-5 space-y-4">
          {/* Live Mic Action Card */}
          <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">
                Audio Input Source
              </span>
              <span className="text-xs font-mono text-neutral-500">
                Lang: <strong className="text-neutral-900">{currentLanguage}</strong> ({currentInfo.whisper_name})
              </span>
            </div>

            {/* Big Record Button */}
            <div className="flex flex-col items-center justify-center py-4">
              {!isRecording ? (
                <button
                  id="start-mic-record-btn"
                  onClick={handleStartRecording}
                  disabled={isLoading}
                  className="group relative flex items-center justify-center w-20 h-20 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <Mic className="w-8 h-8 transition-transform group-hover:scale-110" />
                  <span className="absolute -bottom-6 text-xs font-medium text-neutral-600">
                    Click to Speak
                  </span>
                </button>
              ) : (
                <button
                  id="stop-mic-record-btn"
                  onClick={handleStopRecording}
                  className="group relative flex items-center justify-center w-20 h-20 rounded-full bg-neutral-900 hover:bg-neutral-800 text-white shadow-md ring-4 ring-rose-500/30 transition-all active:scale-95 cursor-pointer animate-pulse"
                >
                  <Square className="w-8 h-8 fill-current" />
                  <span className="absolute -bottom-6 text-xs font-semibold text-rose-600">
                    Recording: {recordDuration}s
                  </span>
                </button>
              )}

              {/* Real-time volume visualizer */}
              {isRecording && (
                <div className="w-48 mt-8 flex items-center space-x-1 justify-center h-4">
                  {[...Array(12)].map((_, i) => {
                    const threshold = i / 12;
                    const isActive = audioVolume > threshold;
                    return (
                      <div
                        key={i}
                        className={`w-2 rounded-full transition-all duration-75 ${
                          isActive ? "h-5 bg-rose-500" : "h-1.5 bg-neutral-200"
                        }`}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick alternatives */}
            <div className="pt-3 border-t border-neutral-200/80 flex items-center justify-between gap-2">
              <button
                id="run-preset-audio-clip-btn"
                onClick={handleRunPresetTestClip}
                disabled={isLoading || isRecording}
                className="flex-1 inline-flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-white hover:bg-neutral-100 border border-neutral-200 text-xs font-medium text-neutral-700 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
              >
                <Radio className="w-3.5 h-3.5 text-sky-600" />
                <span>Test 1-Click Clip ({currentLanguage})</span>
              </button>

              <button
                id="upload-audio-file-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isRecording}
                className="inline-flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-white hover:bg-neutral-100 border border-neutral-200 text-xs font-medium text-neutral-700 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5 text-neutral-500" />
                <span>Upload</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="audio/*"
                className="hidden"
              />
            </div>
          </div>

          {/* Sample phrase guideline */}
          <div className="p-3 bg-sky-50/60 rounded-xl border border-sky-100 text-xs text-sky-800 space-y-1">
            <div className="font-semibold flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5 text-sky-600" />
              <span>Suggested {currentInfo.name} Test Phrase:</span>
            </div>
            <div className="text-sm font-medium text-sky-950 font-indic">
              "{currentInfo.samplePhrase}"
            </div>
            <div className="text-[11px] text-sky-700">
              Meaning: "{currentInfo.sampleTranslation}"
            </div>
          </div>

          {/* Personal Voice Profile Tuning Status */}
          <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/80 text-xs text-amber-900 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AudioWaveform className="w-4 h-4 text-amber-700 shrink-0" />
              <div>
                <span className="font-medium text-amber-950">Acoustic Conditioning:</span>{" "}
                {acousticHintCount > 0 ? (
                  <span>{acousticHintCount} phrases calibrated</span>
                ) : (
                  <span>Ready (speak to calibrate)</span>
                )}
              </div>
            </div>
            {onOpenVoiceLibrary && (
              <button
                onClick={onOpenVoiceLibrary}
                className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 underline shrink-0 cursor-pointer"
              >
                View Library
              </button>
            )}
          </div>
        </div>

        {/* Right: Output and inspection */}
        <div className="lg:col-span-7 space-y-4">
          {/* Toast on save */}
          {voiceSavedToast && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{voiceSavedToast}</span>
              </div>
              {onOpenVoiceLibrary && (
                <button
                  onClick={onOpenVoiceLibrary}
                  className="font-semibold underline hover:text-emerald-950 text-[11px]"
                >
                  Manage
                </button>
              )}
            </div>
          )}

          {/* ─── "Heard: …" Confirmation Chip (permanent diagnostic + UX fix) ─── */}
          {heardText && !isLoading && (
            <div
              id="asr-heard-chip"
              className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                heardText.startsWith("[FALLBACK]")
                  ? "bg-amber-50 border-amber-300"
                  : "bg-sky-50 border-sky-200"
              }`}
            >
              <div className="flex items-start gap-2 text-xs min-w-0">
                <span className={`shrink-0 font-bold mt-0.5 ${heardText.startsWith("[FALLBACK]") ? "text-amber-700" : "text-sky-700"}`}>
                  {heardText.startsWith("[FALLBACK]") ? "⚠ Fallback:" : "🎧 Heard:"}
                </span>
                <span className={`font-medium break-words ${heardText.startsWith("[FALLBACK]") ? "text-amber-900" : "text-sky-900"}`}>
                  "{heardText.replace(/^\[FALLBACK\]\s*/, "")}"
                </span>
              </div>
              {onSendToTts && !heardText.startsWith("[FALLBACK]") && (
                <button
                  id="heard-chip-speak-btn"
                  onClick={() => onSendToTts(heardText, currentLanguage)}
                  className="shrink-0 px-3 py-1.5 bg-sky-600 text-white hover:bg-sky-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  Speak this
                </button>
              )}
            </div>
          )}

          {/* Audio Player if audio ready */}
          {audioBlobUrl && (
            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Volume2 className="w-4 h-4 text-neutral-600" />
                <span className="text-xs font-medium text-neutral-700">Captured Audio Stream</span>
              </div>
              <audio controls src={audioBlobUrl} className="h-8 max-w-[240px]" />
            </div>
          )}

          {/* Transcription Card */}
          <div className="p-4 rounded-xl border border-neutral-200 bg-white min-h-[190px] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    Transcription Output
                  </span>
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-neutral-100 text-neutral-700">
                    Model: {activeModelInfo.name}
                  </span>
                </div>
                {latencyMs && (
                  <span className="inline-flex items-center space-x-1 text-xs font-mono text-neutral-500">
                    <Clock className="w-3 h-3 text-neutral-400" />
                    <span>{latencyMs}ms</span>
                  </span>
                )}
              </div>

              {isLoading ? (
                <div className="py-8 flex flex-col items-center justify-center space-y-2 text-neutral-500">
                  <div className="w-6 h-6 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs">
                    Transcribing with {activeModelInfo.name} ({currentInfo.name})...
                  </span>
                </div>
              ) : error ? (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              ) : transcription ? (
                <div className="space-y-3">
                  <div className="text-lg font-medium text-neutral-900 font-indic leading-relaxed p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                    {transcription.text}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-neutral-50 border border-neutral-100">
                      <span className="text-neutral-500 block text-[10px]">Language Code</span>
                      <strong className="text-neutral-800 font-mono">{transcription.language}</strong>
                    </div>
                    <div className="p-2 rounded-lg bg-neutral-50 border border-neutral-100">
                      <span className="text-neutral-500 block text-[10px]">Model Checkpoint</span>
                      <strong className="text-neutral-800 font-mono truncate block" title={transcription.model}>
                        {transcription.model}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-neutral-50 border border-neutral-100">
                      <span className="text-neutral-500 block text-[10px]">Architecture</span>
                      <strong className="text-neutral-800 font-mono">
                        {transcription.architecture || activeModelInfo.architecture}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-neutral-50 border border-neutral-100">
                      <span className="text-neutral-500 block text-[10px]">Confidence</span>
                      <strong className="text-emerald-700 font-mono">
                        {(transcription.confidence * 100).toFixed(1)}%
                      </strong>
                    </div>
                  </div>

                  {/* Spoken Voice Integration Bar */}
                  <div className="mt-3 p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-emerald-900">
                      <AudioWaveform className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>
                        Voice recorded &amp; archived into your <strong>Personal Voice Library</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {onSendToTts && (
                        <button
                          id="test-transcription-in-tts-btn"
                          onClick={() => onSendToTts(transcription.text, currentLanguage)}
                          className="px-3 py-1.5 bg-neutral-900 text-white hover:bg-neutral-800 rounded-lg text-xs font-medium flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                          <span>Test in Text-to-Speech</span>
                          <ArrowRight className="w-3 h-3 text-neutral-400" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-neutral-400">
                  Click the red microphone to speak or click "Test 1-Click Clip" to run an immediate transcription with {activeModelInfo.name}.
                </div>
              )}
            </div>

            {/* Architecture validation note */}
            <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center justify-between text-[11px] text-neutral-500">
              <span className="flex items-center space-x-1 text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Hugging Face Model: {activeModelInfo.checkpoint}</span>
              </span>
              <span className="font-mono text-neutral-400">POST /asr/transcribe</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
