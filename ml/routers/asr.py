# ml/routers/asr.py
"""
ASR router using faster-whisper (CTranslate2 backend).
~4x faster than vanilla HF transformers on CPU.
Model: openai/whisper-base (74M params, default) - optimized for low memory (<250 MB RSS).
"""
import asyncio
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
MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "base")
DEVICE     = os.environ.get("WHISPER_DEVICE", "cpu")
COMPUTE    = "float16" if DEVICE == "cuda" else "int8"
MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10 MB limit to prevent memory spikes

_model: Optional[WhisperModel] = None
_load_error: Optional[str] = None
_model_lock = asyncio.Lock()
_asr_lock = asyncio.Lock()


def _get_rss_mb() -> float:
    """Return current process Resident Set Size in MB."""
    try:
        import psutil
        return psutil.Process().memory_info().rss / (1024 * 1024)
    except Exception:
        return 0.0



def is_model_loaded() -> bool:
    """Returns True if Whisper model is currently loaded in memory."""
    return _model is not None


def get_load_error() -> Optional[str]:
    """Returns any error encountered during model loading."""
    return _load_error


async def get_model() -> WhisperModel:
    """
    Lazily loads the Whisper model in a thread-safe / async-safe manner.
    Uses cpu_threads=1 and num_workers=1 to minimize RAM and CPU spikes.
    """
    global _model, _load_error
    if _model is not None:
        return _model

    if _load_error is not None:
        raise HTTPException(
            status_code=503,
            detail=f"ASR service unavailable: Whisper model '{MODEL_SIZE}' failed to load ({_load_error}). TTS and other services remain operational."
        )

    async with _model_lock:
        if _model is not None:
            return _model
        if _load_error is not None:
            raise HTTPException(
                status_code=503,
                detail=f"ASR service unavailable: Whisper model '{MODEL_SIZE}' failed to load ({_load_error}). TTS and other services remain operational."
            )

        try:
            print(f"[ASR] Lazily loading faster-whisper '{MODEL_SIZE}' on {DEVICE} ({COMPUTE}) [cpu_threads=1, num_workers=1]...")
            # Run model loading in threadpool to avoid blocking event loop
            loop = asyncio.get_running_loop()
            _model = await loop.run_in_executor(
                None,
                lambda: WhisperModel(
                    MODEL_SIZE,
                    device=DEVICE,
                    compute_type=COMPUTE,
                    cpu_threads=1,
                    num_workers=1,
                )
            )
            rss = _get_rss_mb()
            print(f"[ASR] Whisper '{MODEL_SIZE}' loaded successfully. Resident memory after load: {rss:.1f} MB")
            return _model
        except Exception as e:
            _load_error = str(e)
            print(f"[ASR] ERROR: Failed to load Whisper model '{MODEL_SIZE}': {e}")
            raise HTTPException(
                status_code=503,
                detail=f"ASR service unavailable: Whisper model '{MODEL_SIZE}' failed to load ({_load_error}). TTS and other services remain operational."
            )


def warm_up_model():
    """Optional synchronous warm-up; catches errors to prevent crashing boot."""
    global _model, _load_error
    try:
        print(f"[ASR] Loading faster-whisper '{MODEL_SIZE}' on {DEVICE} ({COMPUTE}) [cpu_threads=1, num_workers=1]...")
        _model = WhisperModel(
            MODEL_SIZE,
            device=DEVICE,
            compute_type=COMPUTE,
            cpu_threads=1,
            num_workers=1,
        )
        rss = _get_rss_mb()
        print(f"[ASR] Whisper '{MODEL_SIZE}' loaded successfully. Resident memory after load: {rss:.1f} MB")
    except Exception as e:
        _load_error = str(e)
        print(f"[ASR] WARNING: Whisper warm-up failed: {e}")


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
        "loaded": loaded,
        "load_error": _load_error,
        "rss_mb": round(_get_rss_mb(), 1),
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

    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Audio file exceeds maximum allowed size of {MAX_AUDIO_BYTES // (1024 * 1024)} MB."
        )

    # [PIPELINE:2] Log what arrives at the ML service
    print(f"[PIPELINE:2] ASR request — lang={language or 'auto'}, bytes={len(audio_bytes)}, mime={audio.content_type}")

    model = await get_model()

    # Guard concurrent ASR jobs with a lock to prevent RAM spikes on 512MB free tier
    async with _asr_lock:
        start = time.perf_counter()

        # Write to temp file (faster-whisper needs a file path, not a buffer)
        suffix = _get_suffix(audio.filename, audio.content_type)
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            whisper_lang = SUPPORTED_LANGUAGES[language]["whisper_name"] if language else None

            loop = asyncio.get_running_loop()
            segments_iter, info = await loop.run_in_executor(
                None,
                lambda: model.transcribe(
                    tmp_path,
                    language=whisper_lang,
                    task="transcribe",
                    vad_filter=True,
                    vad_parameters={"min_silence_duration_ms": 300},  # safe for short AAC utterances
                    word_timestamps=False,
                )
            )

            # Consume iterator within executor/safe context
            def _extract_segments():
                segs = []
                texts = []
                for seg in segments_iter:
                    confidence = float(min(1.0, max(0.0, (seg.avg_logprob + 1.0))))
                    segs.append({
                        "start": round(seg.start, 2),
                        "end":   round(seg.end, 2),
                        "text":  seg.text.strip(),
                        "confidence": round(confidence, 3),
                    })
                    texts.append(seg.text.strip())
                return segs, texts

            segments, full_text_parts = await loop.run_in_executor(None, _extract_segments)

        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

        latency_ms = int((time.perf_counter() - start) * 1000)
        full_text = " ".join(full_text_parts).strip()
        avg_confidence = (
            round(sum(s["confidence"] for s in segments) / len(segments), 3)
            if segments else 0.0
        )
        detected_lang = language or info.language

        rss = _get_rss_mb()
        print(f"[ASR] Resident memory after transcription: {rss:.1f} MB (latency: {latency_ms}ms)")

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
