import React, { useState } from "react";
import { SUPPORTED_LANGUAGES, LANGUAGE_CODES } from "../shared/languages.ts";
import { Code2, Server, CheckCircle2, Copy, Check, Terminal, Layers } from "lucide-react";

export const ArchitectureSection: React.FC = () => {
  const [activeCodeTab, setActiveCodeTab] = useState<"languages" | "asr" | "tts" | "precache" | "gateway">("languages");
  const [copied, setCopied] = useState(false);

  const codeSnippets: Record<string, { filename: string; code: string; language: string }> = {
    languages: {
      filename: "ml/languages.py",
      language: "python",
      code: `# ml/languages.py
# Single source of truth for both ASR and TTS routers.
# Both routers MUST import from this file.

SUPPORTED_LANGUAGES = {
    "en": {"whisper_name": "english",  "google_code": "en-IN"},
    "hi": {"whisper_name": "hindi",    "google_code": "hi-IN"},
    "ta": {"whisper_name": "tamil",    "google_code": "ta-IN"},
    "te": {"whisper_name": "telugu",   "google_code": "te-IN"},
    "kn": {"whisper_name": "kannada",  "google_code": "kn-IN"},
    "bn": {"whisper_name": "bengali",  "google_code": "bn-IN"},
}`,
    },
    asr: {
      filename: "ml/routers/asr.py",
      language: "python",
      code: `# ml/routers/asr.py
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from transformers import pipeline
import torch, librosa, tempfile
from ml.languages import SUPPORTED_LANGUAGES

router = APIRouter(prefix="/asr")

# Supported Hugging Face ASR Models
SUPPORTED_ASR_MODELS = {
    "openai/whisper-small": "openai/whisper-small",
    "ai4bharat/indic-conformer-600m-multilingual": "ai4bharat/indic-conformer-600m-multilingual",
}
DEFAULT_MODEL = "ai4bharat/indic-conformer-600m-multilingual"

device = "cuda" if torch.cuda.is_available() else "cpu"
_model_pipes = {}

def get_pipeline(model_id: str):
    if model_id not in _model_pipes:
        _model_pipes[model_id] = pipeline(
            "automatic-speech-recognition",
            model=model_id,
            device=device,
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
        )
    return _model_pipes[model_id]

@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form(...),
    model: str = Form(DEFAULT_MODEL),
):
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(400, f"Unsupported language '{language}'")
    if model not in SUPPORTED_ASR_MODELS:
        raise HTTPException(400, f"Unsupported ASR model '{model}'")

    pipe = get_pipeline(model)
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        tmp.write(await audio.read())
        tmp.flush()
        speech, _ = librosa.load(tmp.name, sr=16000)

        whisper_lang = SUPPORTED_LANGUAGES[language]["whisper_name"]
        if "whisper" in model:
            result = pipe(speech, generate_kwargs={"language": whisper_lang, "task": "transcribe"})
        else:
            result = pipe(speech)

    return {"text": result["text"], "language": language, "model": model}`,
    },
    tts: {
      filename: "ml/routers/tts.py",
      language: "python",
      code: `# ml/routers/tts.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from google.cloud import texttospeech
from ml.languages import SUPPORTED_LANGUAGES

router = APIRouter(prefix="/tts")
client = texttospeech.TextToSpeechClient()

_voice_cache: dict[str, str] = {}  # google_code -> chosen voice name

def get_best_voice(google_code: str) -> str:
    if google_code in _voice_cache:
        return _voice_cache[google_code]
    voices = client.list_voices(language_code=google_code).voices
    if not voices:
        raise RuntimeError(f"No Google TTS voices found for {google_code}")
    name = next((v.name for v in voices if "Neural2" in v.name),
           next((v.name for v in voices if "Wavenet" in v.name), voices[0].name))
    _voice_cache[google_code] = name
    return name

@router.post("/synthesize")
async def synthesize(text: str, language: str, speaking_rate: float = 1.0):
    if language not in SUPPORTED_LANGUAGES:
        raise HTTPException(400, f"Unsupported language '{language}'. Supported: {list(SUPPORTED_LANGUAGES)}")

    google_code = SUPPORTED_LANGUAGES[language]["google_code"]
    voice_name = get_best_voice(google_code)

    response = client.synthesize_speech(
        input=texttospeech.SynthesisInput(text=text),
        voice=texttospeech.VoiceSelectionParams(language_code=google_code, name=voice_name),
        audio_config=texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.OGG_OPUS,
            speaking_rate=speaking_rate,
        ),
    )
    return Response(content=response.audio_content, media_type="audio/ogg")`,
    },
    precache: {
      filename: "ml/scripts/precache_vocabulary.py",
      language: "python",
      code: `# ml/scripts/precache_vocabulary.py
from ml.languages import SUPPORTED_LANGUAGES
from ml.routers.tts import synthesize
import json

with open("data/fixed_vocabulary.json") as f:
    phrases = json.load(f)

for phrase_key, translations in phrases.items():
    for lang_code in SUPPORTED_LANGUAGES:
        text = translations.get(lang_code)
        if not text:
            print(f"WARNING: missing {lang_code} translation for '{phrase_key}'")
            continue
        audio = synthesize_sync(text, lang_code)
        save_to_storage(f"{phrase_key}_{lang_code}.ogg", audio)`,
    },
    gateway: {
      filename: "architecture/gateway_flutter.dart",
      language: "dart",
      code: `// Task 4: Flutter / Client Architecture Flow
// 1. Checks local cache first for TTS (instant zero-latency audio)
// 2. Requires network for ASR
// 3. ALWAYS passes selected language code (one of the six), never null

Future<void> speakPhrase(String phraseKey, String langCode) async {
  // Check local cache first
  final cachedAudio = await AudioCache.get(phraseKey, langCode);
  if (cachedAudio != null) {
    await audioPlayer.play(BytesSource(cachedAudio));
    return;
  }

  // Fallback to Gateway TTS endpoint with required language
  final response = await http.post(
    Uri.parse('\$apiGateway/tts/synthesize'),
    body: {'text': phraseKey, 'language': langCode},
  );
  await AudioCache.save(phraseKey, langCode, response.bodyBytes);
  await audioPlayer.play(BytesSource(response.bodyBytes));
}`,
    },
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(codeSnippets[activeCodeTab].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="architecture-section" className="space-y-6">
      {/* Languages Table: Single Source of Truth */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 p-5 shadow-xs">
        <div className="flex items-center space-x-2 mb-3">
          <Layers className="w-5 h-5 text-sky-600" />
          <h3 className="font-semibold text-base text-neutral-900">
            Single Source of Truth: Supported Languages (6 Languages)
          </h3>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Defined once in <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono">ml/languages.py</code> and{" "}
          <code className="bg-neutral-100 px-1 py-0.5 rounded font-mono">src/shared/languages.ts</code>. Both ASR
          and TTS routers import directly from it.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-50 text-neutral-600 font-semibold border-y border-neutral-200">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Language</th>
                <th className="p-3">Native Script</th>
                <th className="p-3">ISO Code (App)</th>
                <th className="p-3">Whisper Language Name</th>
                <th className="p-3">Google TTS Code</th>
                <th className="p-3">Best Voice Resolved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {LANGUAGE_CODES.map((code, idx) => {
                const lang = SUPPORTED_LANGUAGES[code];
                return (
                  <tr key={code} className="hover:bg-neutral-50/50">
                    <td className="p-3 font-mono text-neutral-400">{idx + 1}</td>
                    <td className="p-3 font-semibold text-neutral-900">{lang.name}</td>
                    <td className="p-3 font-indic text-neutral-700">{lang.nativeName}</td>
                    <td className="p-3">
                      <span className="font-mono font-bold uppercase px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                        {lang.code}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-neutral-600">{lang.whisper_name}</td>
                    <td className="p-3 font-mono text-indigo-600 font-medium">{lang.google_code}</td>
                    <td className="p-3 font-mono text-xs text-emerald-700 font-semibold">
                      {code === "en"
                        ? "en-IN-Neural2-B"
                        : code === "hi"
                        ? "hi-IN-Neural2-A"
                        : code === "ta"
                        ? "ta-IN-Neural2-A"
                        : code === "te"
                        ? "te-IN-Standard-A"
                        : code === "kn"
                        ? "kn-IN-Standard-A"
                        : "bn-IN-Wavenet-A"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Code Inspector */}
      <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-5 shadow-md text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-mono text-neutral-300">
              {codeSnippets[activeCodeTab].filename}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <div className="flex items-center bg-neutral-800 p-1 rounded-lg">
              {(["languages", "asr", "tts", "precache", "gateway"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveCodeTab(tab)}
                  className={`px-2.5 py-1 text-xs rounded-md font-mono transition-colors cursor-pointer ${
                    activeCodeTab === tab
                      ? "bg-neutral-700 text-white"
                      : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <button
              onClick={handleCopy}
              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-mono transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>

        <pre className="mt-4 p-4 rounded-xl bg-neutral-950 font-mono text-xs text-neutral-300 overflow-x-auto leading-relaxed border border-neutral-850">
          <code>{codeSnippets[activeCodeTab].code}</code>
        </pre>
      </div>
    </div>
  );
};
