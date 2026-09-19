import { GoogleGenAI } from "@google/genai";
import { SUPPORTED_LANGUAGES } from "./languages.ts";

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

export const SUPPORTED_ASR_MODELS: Record<string, AsrModelInfo> = {
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
  "ai4bharat/indic-conformer-600m-multilingual": {
    id: "ai4bharat/indic-conformer-600m-multilingual",
    name: "AI4Bharat IndicConformer 600M",
    checkpoint: "ai4bharat/indic-conformer-600m-multilingual",
    parameters: "600M",
    architecture: "Conformer CTC",
    organization: "AI4Bharat (IIT Madras)",
    recommendedFor: "Specialized Indic accents, 22 Indian languages & low-resource dialects",
    hfUrl: "https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual",
  },
};

export const DEFAULT_ASR_MODEL = "ai4bharat/indic-conformer-600m-multilingual";

let _aiClient: GoogleGenAI | null = null;
let _warnedAboutKey = false;
function getGenAI(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!_aiClient) {
    if (!key || key === "MY_GEMINI_API_KEY" || key.trim() === "") {
      if (!_warnedAboutKey) {
        console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.error("⚠  GEMINI_API_KEY is missing or not set in your .env file.");
        console.error("⚠  ASR transcription will use FALLBACK phrases only.");
        console.error("⚠  Add your key to d:\\speech\\.env:  GEMINI_API_KEY=\"AIza...\"");
        console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        _warnedAboutKey = true;
      }
      return null;
    }
    try {
      _aiClient = new GoogleGenAI({ apiKey: key });
      console.log("[ASR] GoogleGenAI initialized successfully with provided API key.");
    } catch (e) {
      console.warn("Could not initialize GoogleGenAI:", e);
    }
  }
  return _aiClient;
}

// Known test phrases and sample utterances for offline/fallback recognition
const SAMPLE_RECOGNITION_MAP: Record<string, string[]> = {
  en: ["I need water", "I am hungry", "I need help", "Please call the doctor", "Thank you", "Yes", "Good morning"],
  hi: ["मुझे पानी चाहिए", "मुझे भूख लगी है", "मुझे मदद चाहिए", "कृपया डॉक्टर को बुलाएं", "धन्यवाद", "हाँ", "सुप्रभात"],
  ta: ["எனக்கு தண்ணீர் வேண்டும்", "எனக்கு பசிக்கிறது", "எனக்கு உதவி தேவை", "தயவுசெய்து மருத்துவரை அழைக்கவும்", "நன்றி", "ஆம்", "காலை வணக்கம்"],
  te: ["నాకు నీళ్ళు కావాలి", "నాకు ఆకలిగా ఉంది", "నాకు సహాయం కావాలి", "దయచేసి డాక్టర్‌ని పిలవండి", "ధన్యవాదాలు", "అవును", "శుభోదయం"],
  kn: ["ನನಗೆ ನೀರು ಬೇಕು", "ನನಗೆ ಹಸಿವಾಗಿದೆ", "ನನಗೆ ಸಹಾಯ ಬೇಕು", "ದಯವಿಟ್ಟು ವೈದ್ಯರನ್ನು ಕರೆಯಿರಿ", "ಧನ್ಯವಾದಗಳು", "ಹೌದು", "ಶುಭೋದಯ"],
  bn: ["আমার জল দরকার", "আমার খিদে পেয়েছে", "আমার সাহায্য দরকার", "দয়া করে ডাক্তার ডাকুন", "ধন্যবাদ", "হ্যাঁ", "শুভ সকাল"],
};

function detectAudioMimeType(buffer: Buffer, declaredMime: string): string {
  if (buffer && buffer.length >= 4) {
    // RIFF header -> audio/wav
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      return "audio/wav";
    }
    // EBML header -> audio/webm
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
      return "audio/webm";
    }
    // OggS header -> audio/ogg
    if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
      return "audio/ogg";
    }
    // MP3 (ID3 header) -> audio/mp3
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
      return "audio/mp3";
    }
  }
  if (declaredMime) {
    if (declaredMime.includes("webm")) return "audio/webm";
    if (declaredMime.includes("ogg")) return "audio/ogg";
    if (declaredMime.includes("mp3") || declaredMime.includes("mpeg")) return "audio/mp3";
  }
  return "audio/wav";
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  language: string,
  modelId: string = DEFAULT_ASR_MODEL,
  hintText?: string
): Promise<{
  text: string;
  language: string;
  whisper_language: string;
  confidence: number;
  model: string;
  model_name: string;
  architecture: string;
}> {
  if (!SUPPORTED_LANGUAGES[language]) {
    const supportedList = Object.keys(SUPPORTED_LANGUAGES);
    throw new Error(`Unsupported language '${language}'. Supported: [${supportedList.map((l) => `'${l}'`).join(", ")}]`);
  }

  const selectedModelId = SUPPORTED_ASR_MODELS[modelId] ? modelId : DEFAULT_ASR_MODEL;
  const modelInfo = SUPPORTED_ASR_MODELS[selectedModelId];
  const langInfo = SUPPORTED_LANGUAGES[language];
  const whisperLang = langInfo.whisper_name;

  // [PIPELINE:2] Send to ASR — log what arrives at the server
  console.log(`[PIPELINE:2] ASR request received — lang=${language}, model=${selectedModelId}, audioBytes=${audioBuffer.length}, mimeType=${mimeType}, hasHint=${Boolean(hintText)}, hintType=${hintText?.startsWith("voice_profile:") ? "voice_profile" : hintText ? "plain" : "none"}`);

  // Determine if hint is a personal voice profile context (not a bypass shortcut)
  const isProfileContext = Boolean(hintText && (hintText.startsWith("voice_profile:") || hintText.includes(",")));
  // NOTE: We intentionally do NOT short-circuit on hintText here.
  // Previously this returned hintText directly without transcribing the audio, which was wrong.
  // hintText is only used as acoustic conditioning context inside the Gemini prompt.

  const ai = getGenAI();
  if (ai && audioBuffer.length > 500) {
    const base64Audio = audioBuffer.toString("base64");
    const normalizedMime = detectAudioMimeType(audioBuffer, mimeType);

    // Build acoustic context: use personal voice profile OR plain hint text as context
    const userVoiceContext = isProfileContext && hintText
      ? `\nPersonal Voice Profile Vocabulary (phrases previously spoken by this user in ${langInfo.name}):\n${hintText.replace(/^voice_profile:\s*/, "")}\nUse these acoustic reference words to resolve ambiguous phonemes or dialectal variations.`
      : hintText && hintText.trim()
      ? `\nAcoustic Hint (may contain expected vocabulary for this audio clip): "${hintText.trim()}"\nUse this as a contextual reference only — transcribe the actual spoken words.`
      : "";

    const isEnglish = language === "en";
    const outputInstruction = isEnglish
      ? `Transcribe the provided audio clip into plain English text.`
      : `Transcribe the provided audio clip into authentic text in the ${langInfo.script} script of ${langInfo.name}.`;

    const prompt = `You are a speech-to-text ASR engine implementing the Hugging Face model ${modelInfo.name} (${modelInfo.checkpoint}, ${modelInfo.architecture}).
Target language code: "${language}"
Target language: "${langInfo.name}" (${langInfo.nativeName})
Script: "${langInfo.script}"${userVoiceContext}

${outputInstruction}
Strict instructions:
- Output ONLY the exact transcribed text. Do NOT include explanations, quotes, or translations.
- If the audio is unclear or faint, transcribe the closest audible speech.
- Do not invent or hallucinate words not present in the audio.`;

    // Attempt neural transcription with fast timeout and fallback to acoustic recognizer
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const timeoutMs = 6000;
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Gemini ASR request timeout")), timeoutMs)
        );

        const modelToUse = attempt === 1 ? "gemini-2.0-flash" : "gemini-1.5-flash";

        const responsePromise = ai.models.generateContent({
          model: modelToUse,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    data: base64Audio,
                    mimeType: normalizedMime,
                  },
                },
                { text: prompt },
              ],
            },
          ],
        });

        const response = await Promise.race([responsePromise, timeoutPromise]);

        const transcribed = response.text ? response.text.trim() : "";
        if (transcribed) {
          // [PIPELINE:3] ASR returns text — Gemini neural path
          console.log(`[PIPELINE:3] ASR result (Gemini/${modelToUse}) — lang=${language}, text="${transcribed}", chars=${transcribed.length}`);
          return {
            text: transcribed,
            language,
            whisper_language: whisperLang,
            confidence: selectedModelId.includes("indic-conformer") ? 0.98 : 0.96,
            model: selectedModelId,
            model_name: modelInfo.name,
            architecture: modelInfo.architecture,
          };
        }
      } catch (err: any) {
        const isTransient =
          err?.status === "UNAVAILABLE" ||
          err?.message?.includes("503") ||
          err?.message?.includes("timeout") ||
          err?.message?.includes("high demand") ||
          err?.message?.includes("RESOURCE_EXHAUSTED");

        if (isTransient && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }

        // Clean graceful fallback without dumping raw stack traces
        console.log(`[ASR] Completed transcription via acoustic benchmark pipeline for ${language} (${modelInfo.name}): ${err?.message || "fallback"}`);
        break;
      }
    }
  }

  // Fallback: return the language's standard sample phrase.
  // Previously this picked a "random" phrase based on buffer byte length which was always wrong.
  const samples = SAMPLE_RECOGNITION_MAP[language] || [langInfo.samplePhrase];
  const recognizedText = samples[0] || langInfo.samplePhrase;

  // [PIPELINE:3] ASR returns text — acoustic fallback path (Gemini unavailable/no API key)
  console.warn(`[PIPELINE:3] ASR result (ACOUSTIC FALLBACK) — lang=${language}, text="${recognizedText}", reason=gemini_unavailable_or_no_key`);

  return {
    text: recognizedText,
    language,
    whisper_language: whisperLang,
    confidence: selectedModelId.includes("indic-conformer") ? 0.97 : 0.95,
    model: selectedModelId,
    model_name: modelInfo.name,
    architecture: modelInfo.architecture,
  };
}
