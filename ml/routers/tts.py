# ml/routers/tts.py
"""
TTS router supporting Google Cloud Text-to-Speech (primary)
and high-quality Neural Edge-TTS / gTTS (zero-credential fallback).
- Supports all 6 Indic languages: English, Hindi, Tamil, Telugu, Kannada, Bengali.
- Caches synthesized audio in-memory by hash(text+language+voice+rate).
- Exposes X-Voice-Name, X-Language-Code, X-Cache-Hit, X-Latency-Ms headers.
"""
import asyncio
import hashlib
import io
import os
import time
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from ml.languages import SUPPORTED_LANGUAGES

router = APIRouter(prefix="/tts", tags=["TTS"])

_tts_client = None
_gcp_available = None  # None = unchecked, True = ready, False = fallback mode
_voice_cache: dict[str, str] = {}
_audio_cache: dict[str, bytes] = {}

NEURAL_FALLBACK_VOICES = {
    "en": {"FEMALE": "en-IN-NeerjaNeural", "MALE": "en-IN-PrabhatNeural", "NEUTRAL": "en-IN-NeerjaNeural"},
    "hi": {"FEMALE": "hi-IN-SwaraNeural", "MALE": "hi-IN-MadhurNeural", "NEUTRAL": "hi-IN-SwaraNeural"},
    "ta": {"FEMALE": "ta-IN-PallaviNeural", "MALE": "ta-IN-ValluvarNeural", "NEUTRAL": "ta-IN-PallaviNeural"},
    "te": {"FEMALE": "te-IN-ShrutiNeural", "MALE": "te-IN-MohanNeural", "NEUTRAL": "te-IN-ShrutiNeural"},
    "kn": {"FEMALE": "kn-IN-SapnaNeural", "MALE": "kn-IN-GaganNeural", "NEUTRAL": "kn-IN-SapnaNeural"},
    "bn": {"FEMALE": "bn-IN-TanishaaNeural", "MALE": "bn-IN-BashkarNeural", "NEUTRAL": "bn-IN-TanishaaNeural"},
}


def get_tts_client():
    global _tts_client, _gcp_available
    if _gcp_available is False:
        return None
    if _tts_client is None:
        try:
            cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            if cred_path:
                if not os.path.isabs(cred_path):
                    resolved_cred = os.path.join(os.path.dirname(os.path.dirname(__file__)), cred_path.lstrip("./\\"))
                    if os.path.exists(resolved_cred):
                        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = resolved_cred
                    else:
                        # Clear invalid path to prevent google auth exception
                        os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
                        _gcp_available = False
                        print("[TTS] No valid Google Cloud credentials file found. Using high-fidelity Neural engine.")
                        return None

            from google.cloud import texttospeech
            _tts_client = texttospeech.TextToSpeechClient()
            _gcp_available = True
        except Exception as e:
            print(f"[TTS] Google Cloud TTS credentials not available ({e}). Using high-fidelity Neural fallback.")
            _gcp_available = False
            _tts_client = None
    return _tts_client


def is_tts_ready() -> bool:
    """TTS is always ready as Neural Edge-TTS / gTTS fallback requires 0 credentials."""
    return True



def get_best_voice(google_code: str, lang_key: str, gender: str = "FEMALE") -> str:
    """Pick best available voice name."""
    cache_key = f"{google_code}_{gender}"
    if cache_key in _voice_cache:
        return _voice_cache[cache_key]

    client = get_tts_client()
    if client is not None:
        try:
            voices = client.list_voices(language_code=google_code).voices
            if voices:
                name = (
                    next((v.name for v in voices if "Neural2" in v.name), None)
                    or next((v.name for v in voices if "Wavenet" in v.name), None)
                    or voices[0].name
                )
                _voice_cache[cache_key] = name
                print(f"[TTS] Google Cloud voice selected: {google_code} -> {name}")
                return name
        except Exception as e:
            print(f"[TTS] list_voices failed ({e}), switching to Neural fallback.")

    fallback_voice = NEURAL_FALLBACK_VOICES.get(lang_key, {}).get(gender, f"{google_code}-Standard-A")
    _voice_cache[cache_key] = fallback_voice
    return fallback_voice


class SynthesizeRequest(BaseModel):
    text: str
    language: str
    speaking_rate: float = 1.0
    voice_gender: Optional[str] = "FEMALE"  # MALE | FEMALE | NEUTRAL


@router.get("/health")
def tts_health():
    client = get_tts_client()
    return {
        "status": "ok",
        "provider": "google_cloud" if client is not None else "edge_neural_tts",
        "voice_cache": _voice_cache,
        "audio_cache_entries": len(_audio_cache),
    }


@router.post("/synthesize")
async def synthesize(req: SynthesizeRequest):
    """
    Synthesize text to audio via Google Cloud TTS (or Neural engine).

    Input:  { text, language, speaking_rate?, voice_gender? }
    Output: audio bytes with X-Voice-Name, X-Cache-Hit headers
    """
    if req.language not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language '{req.language}'. Supported: {list(SUPPORTED_LANGUAGES.keys())}"
        )

    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="'text' must not be empty.")
    if len(text.encode("utf-8")) > 5000:
        raise HTTPException(status_code=400, detail="Text exceeds 5000-byte limit.")

    google_code = SUPPORTED_LANGUAGES[req.language]["google_code"]
    voice_name  = get_best_voice(google_code, req.language, req.voice_gender or "FEMALE")

    # Cache key: stable hash of text + language + voice + rate
    cache_key = hashlib.sha256(
        f"{text}|{req.language}|{voice_name}|{req.speaking_rate}".encode()
    ).hexdigest()

    if cache_key in _audio_cache:
        # [PIPELINE:5] Cache hit
        print(f"[PIPELINE:5] TTS cache HIT — lang={req.language}, voice={voice_name}, key={cache_key[:8]}")
        return Response(
            content=_audio_cache[cache_key],
            media_type="audio/mpeg",
            headers={"X-Voice-Name": voice_name, "X-Cache-Hit": "true", "X-Language-Code": req.language},
        )

    # [PIPELINE:4] Log what is being synthesized
    safe_preview = text[:60].encode("ascii", errors="backslashreplace").decode("ascii")
    print(f"[PIPELINE:4] TTS synthesize — text=\"{safe_preview}\", lang={req.language}, voice={voice_name}, rate={req.speaking_rate}")


    start = time.perf_counter()
    audio_bytes = None
    media_type = "audio/mpeg"

    client = get_tts_client()
    if client is not None:
        try:
            from google.cloud import texttospeech
            gender_map = {
                "MALE":    texttospeech.SsmlVoiceGender.MALE,
                "FEMALE":  texttospeech.SsmlVoiceGender.FEMALE,
                "NEUTRAL": texttospeech.SsmlVoiceGender.NEUTRAL,
            }
            response = client.synthesize_speech(
                input=texttospeech.SynthesisInput(text=text),
                voice=texttospeech.VoiceSelectionParams(
                    language_code=google_code,
                    name=voice_name,
                    ssml_gender=gender_map.get(req.voice_gender or "FEMALE", texttospeech.SsmlVoiceGender.FEMALE),
                ),
                audio_config=texttospeech.AudioConfig(
                    audio_encoding=texttospeech.AudioEncoding.MP3,
                    speaking_rate=req.speaking_rate,
                ),
            )
            audio_bytes = response.audio_content
        except Exception as e:
            print(f"[TTS] Google Cloud synthesize failed ({e}), attempting Neural fallback...")

    if audio_bytes is None:
        # Neural Edge-TTS engine
        try:
            import edge_tts
            fallback_voice = NEURAL_FALLBACK_VOICES.get(req.language, {}).get(req.voice_gender or "FEMALE", "en-IN-NeerjaNeural")
            rate_str = f"{int((req.speaking_rate - 1.0) * 100):+d}%"
            communicate = edge_tts.Communicate(text, fallback_voice, rate=rate_str)
            buf = io.BytesIO()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    buf.write(chunk["data"])
            audio_bytes = buf.getvalue()
            voice_name = fallback_voice
        except Exception as fallback_err:
            print(f"[TTS] Neural Edge-TTS failed ({fallback_err}), attempting gTTS fallback...")
            try:
                from gtts import gTTS
                gtts_obj = gTTS(text=text, lang=req.language if req.language in ["en", "hi", "bn", "ta", "te", "kn"] else "en")
                buf = io.BytesIO()
                gtts_obj.write_to_fp(buf)
                audio_bytes = buf.getvalue()
                voice_name = f"{req.language}-gTTS-Standard"
            except Exception as final_err:
                raise HTTPException(status_code=500, detail=f"TTS synthesis error: {final_err}")

    latency_ms = int((time.perf_counter() - start) * 1000)

    # Store in cache
    _audio_cache[cache_key] = audio_bytes

    # [PIPELINE:5] Log returned audio
    print(f"[PIPELINE:5] TTS audio returned — size={len(audio_bytes)} bytes, voice={voice_name}, latency={latency_ms}ms")

    return Response(
        content=audio_bytes,
        media_type=media_type,
        headers={
            "X-Voice-Name":     voice_name,
            "X-Google-Code":    google_code,
            "X-Language-Code":  req.language,
            "X-Cache-Hit":      "false",
            "X-Latency-Ms":     str(latency_ms),
        },
    )

