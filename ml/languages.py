# ml/languages.py
"""
Single source of truth for supported Indic and English languages.
Both ASR (Whisper) and TTS (Google Cloud) routers MUST import from this file.
"""

SUPPORTED_LANGUAGES = {
    "en": {"whisper_name": "en", "whisper_code": "en", "google_code": "en-IN", "display_name": "English"},
    "hi": {"whisper_name": "hi", "whisper_code": "hi", "google_code": "hi-IN", "display_name": "Hindi (हिन्दी)"},
    "ta": {"whisper_name": "ta", "whisper_code": "ta", "google_code": "ta-IN", "display_name": "Tamil (தமிழ்)"},
    "te": {"whisper_name": "te", "whisper_code": "te", "google_code": "te-IN", "display_name": "Telugu (తెలుగు)"},
    "kn": {"whisper_name": "kn", "whisper_code": "kn", "google_code": "kn-IN", "display_name": "Kannada (ಕನ್ನಡ)"},
    "bn": {"whisper_name": "bn", "whisper_code": "bn", "google_code": "bn-IN", "display_name": "Bengali (বাংলা)"},
}

