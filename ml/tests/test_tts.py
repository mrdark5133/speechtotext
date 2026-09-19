# ml/tests/test_tts.py
"""
TTS endpoint tests.
Google TTS client is mocked so tests run without real GCP credentials.
"""
import pytest
from unittest.mock import MagicMock, patch
from ml.languages import SUPPORTED_LANGUAGES


@pytest.fixture(autouse=True)
def mock_tts_client(monkeypatch):
    """
    Replace the real Google TTS client with a mock that returns
    a plausible OGG audio stub (1024 bytes of zeros).
    """
    fake_audio = b"\x00" * 2048  # fake audio content

    mock_response = MagicMock()
    mock_response.audio_content = fake_audio

    mock_list_voices_response = MagicMock()
    mock_voice = MagicMock()
    mock_voice.name = "en-IN-Neural2-B"
    mock_list_voices_response.voices = [mock_voice]

    mock_client = MagicMock()
    mock_client.synthesize_speech.return_value = mock_response
    mock_client.list_voices.return_value = mock_list_voices_response

    # Patch both the module-level client and the factory function
    import ml.routers.tts as tts_module
    monkeypatch.setattr(tts_module, "_tts_client", mock_client)
    # Pre-populate voice cache so list_voices is not called during tests
    tts_module._voice_cache.clear()
    for lang, info in SUPPORTED_LANGUAGES.items():
        tts_module._voice_cache[info["google_code"]] = mock_voice.name

    return mock_client


@pytest.mark.parametrize("lang_code", list(SUPPORTED_LANGUAGES.keys()))
def test_synthesize_each_language(client, lang_code):
    """Each language returns non-empty audio and correct content-type."""
    r = client.post("/tts/synthesize", json={"text": "hello world", "language": lang_code})
    assert r.status_code == 200, r.text
    assert len(r.content) > 100
    assert r.headers.get("content-type", "").startswith("audio/")


def test_cache_hit_does_not_call_api_twice(client, mock_tts_client):
    """Same text+language twice must only call synthesize_speech once."""
    import ml.routers.tts as tts_module
    tts_module._audio_cache.clear()

    payload = {"text": "cache test phrase", "language": "en"}
    r1 = client.post("/tts/synthesize", json=payload)
    r2 = client.post("/tts/synthesize", json=payload)

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r2.headers.get("X-Cache-Hit") == "true"
    # API must have been called exactly once
    assert mock_tts_client.synthesize_speech.call_count == 1


def test_unsupported_language_fails(client):
    """Unsupported language must return 400."""
    r = client.post("/tts/synthesize", json={"text": "hello", "language": "de"})
    assert r.status_code == 400


def test_empty_text_fails(client):
    """Empty text must return 400."""
    r = client.post("/tts/synthesize", json={"text": "", "language": "en"})
    assert r.status_code == 400


def test_text_too_long_fails(client):
    """Text exceeding 5000 bytes must return 400."""
    long_text = "a" * 5001
    r = client.post("/tts/synthesize", json={"text": long_text, "language": "en"})
    assert r.status_code == 400


def test_tts_health(client):
    """Health endpoint returns ok."""
    r = client.get("/tts/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
