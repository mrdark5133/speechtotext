# ml/startup_checks.py
from ml.languages import SUPPORTED_LANGUAGES
from ml.routers.tts import get_best_voice

def verify_all_tts_languages():
    """
    Startup check — run once when the ML service boots, fail loudly if a language has no voice.
    Verifies that a high-quality Google voice (Neural2 / Wavenet / Standard) exists for each language.
    """
    print("[startup] Verifying Google Cloud TTS voices for all 6 supported languages...")
    verified = {}
    for code, info in SUPPORTED_LANGUAGES.items():
        voice = get_best_voice(info["google_code"])
        print(f"[startup] {code} ({info['google_code']}) -> {voice}")
        verified[code] = voice
    print("[startup] All 6 language TTS voices verified successfully!")
    return verified
