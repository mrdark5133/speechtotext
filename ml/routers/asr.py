# ml/routers/asr.py
"""
ASR router using faster-whisper (CTranslate2 backend).
~4x faster than vanilla HF transformers on CPU.
Model: openai/whisper-small (244M params) - swap checkpoint without changing API.
"""
import os
import tempfile
import time
import hashlib
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from faster_whisper import WhisperModel

from ml.languages import SUPPORTED_LANGUAGES

router = APIRouter(prefix="/asr", tags=["ASR"])

# ── Model config ──────────────────────────────────────────────
MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "small")
DEVICE     = os.environ.get("WHISPER_DEVICE", "cpu")
COMPUTE    = "float16" if DEVICE == "cuda" else "int8"

_model: Optional[WhisperModel] = None


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        print(f"[ASR] Loading faster-whisper '{MODEL_SIZE}' on {DEVICE} ({COMPUTE})...")
        _model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE)
        print("[ASR] Model loaded successfully.")
    return _model


def warm_up_model():
    """Called at startup to pre-load the model into memory."""
    get_model()
    print(f"[ASR] Whisper '{MODEL_SIZE}' warmed up on {DEVICE}.")


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/health")
def asr_health():
    """Reports model load status and device."""
    loaded = _model is not None
    return {
        "status": "ready" if loaded else "not_loaded",
        "model": f"whisper-{MODEL_SIZE}",
        "device": DEVICE,
        "compute_type": COMPUTE,
    }


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: Optional[str] = Form(None),  # ISO code e.g. "hi", "ta" — optional, Whisper auto-detects
):
    """
    Transcribe audio to text using faster-whisper.

    Input:  multipart audio file (wav/webm/ogg/mp4) + optional language hint
    Output: { text, language, confidence, segments, model, device, latency_ms }
    """
    if language and language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language '{language}'. Supported: {list(SUPPORTED_LANGUAGES.keys())}"
        )

    audio_bytes = await audio.read()
    if len(audio_bytes) < 100:
        raise HTTPException(status_code=400, detail="Audio file is too small or empty.")

    # [PIPELINE:2] Log what arrives at the ML service
    print(f"[PIPELINE:2] ASR request — lang={language or 'auto'}, bytes={len(audio_bytes)}, mime={audio.content_type}")

    model = get_model()
    start = time.perf_counter()

    # Write to temp file (faster-whisper needs a file path, not a buffer)
    suffix = _get_suffix(audio.filename, audio.content_type)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        whisper_lang = SUPPORTED_LANGUAGES[language]["whisper_name"] if language else None

        segments_iter, info = model.transcribe(
            tmp_path,
            language=whisper_lang,
            task="transcribe",
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 300},  # safe for short AAC utterances
            word_timestamps=False,
        )

        segments = []
        full_text_parts = []
        for seg in segments_iter:
            # avg_logprob is log-probability; convert to 0-1 confidence
            confidence = float(min(1.0, max(0.0, (seg.avg_logprob + 1.0))))
            segments.append({
                "start": round(seg.start, 2),
                "end":   round(seg.end, 2),
                "text":  seg.text.strip(),
                "confidence": round(confidence, 3),
            })
            full_text_parts.append(seg.text.strip())

    finally:
        os.unlink(tmp_path)

    latency_ms = int((time.perf_counter() - start) * 1000)
    full_text = " ".join(full_text_parts).strip()
    avg_confidence = (
        round(sum(s["confidence"] for s in segments) / len(segments), 3)
        if segments else 0.0
    )
    detected_lang = language or info.language

    # [PIPELINE:3] Log what is returned
    safe_text_preview = full_text[:60].encode("ascii", errors="backslashreplace").decode("ascii")
    print(f"[PIPELINE:3] ASR result — text=\"{safe_text_preview}\", lang={detected_lang}, confidence={avg_confidence}, latency={latency_ms}ms")


    return {
        "text":       full_text,
        "language":   detected_lang,
        "whisper_language": SUPPORTED_LANGUAGES.get(detected_lang, {}).get("whisper_name", detected_lang),
        "confidence": avg_confidence,
        "segments":   segments,
        "model":      f"whisper-{MODEL_SIZE}",
        "device":     DEVICE,
        "latency_ms": latency_ms,
    }


def _get_suffix(filename: Optional[str], content_type: Optional[str]) -> str:
    if filename:
        ext = os.path.splitext(filename)[-1]
        if ext:
            return ext
    if content_type:
        mapping = {
            "audio/wav":  ".wav",
            "audio/webm": ".webm",
            "audio/ogg":  ".ogg",
            "audio/mp4":  ".mp4",
            "audio/mpeg": ".mp3",
            "audio/mp3":  ".mp3",
        }
        for mime, ext in mapping.items():
            if mime in content_type:
                return ext
    return ".webm"
