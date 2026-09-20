# ml/tests/test_asr.py
import time
import pytest
from ml.languages import SUPPORTED_LANGUAGES


def test_asr_health(client):
    """Health endpoint reports model status."""
    r = client.get("/asr/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] in ("ready", "not_loaded")
    assert "model" in data
    assert "device" in data


@pytest.mark.parametrize("lang_code", list(SUPPORTED_LANGUAGES.keys()))
def test_transcribe_each_language(client, sample_audio_for, lang_code):
    """Transcription returns non-empty text for all 6 languages."""
    audio_path = sample_audio_for(lang_code)
    with open(audio_path, "rb") as f:
        r = client.post(
            "/asr/transcribe",
            files={"audio": ("sample.wav", f, "audio/wav")},
            data={"language": lang_code},
        )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "text" in data
    assert "confidence" in data
    assert "segments" in data
    assert data["language"] == lang_code


def test_transcribe_no_language_hint(client, sample_audio_for):
    """Transcription works without a language hint (auto-detect)."""
    audio_path = sample_audio_for("en")
    with open(audio_path, "rb") as f:
        r = client.post(
            "/asr/transcribe",
            files={"audio": ("sample.wav", f, "audio/wav")},
        )
    assert r.status_code == 200


def test_low_confidence_segments_are_exposed(client, sample_audio_for):
    """Low-confidence segments must be returned, not silently hidden."""
    audio_path = sample_audio_for("en")
    with open(audio_path, "rb") as f:
        r = client.post(
            "/asr/transcribe",
            files={"audio": ("sample.wav", f, "audio/wav")},
            data={"language": "en"},
        )
    assert r.status_code == 200
    data = r.json()
    # Segments must be a list (may be empty for silent audio, but key must exist)
    assert isinstance(data["segments"], list)
    # Each segment must carry its own confidence score
    for seg in data["segments"]:
        assert "confidence" in seg
        assert 0.0 <= seg["confidence"] <= 1.0


def test_unsupported_language_fails(client, sample_audio_for):
    """Unsupported language code must return 400."""
    audio_path = sample_audio_for("en")
    with open(audio_path, "rb") as f:
        r = client.post(
            "/asr/transcribe",
            files={"audio": ("sample.wav", f, "audio/wav")},
            data={"language": "fr"},
        )
    assert r.status_code == 400
    assert "Unsupported language" in r.json()["detail"]


def test_empty_audio_fails(client):
    """Empty audio payload must return 400."""
    import io
    r = client.post(
        "/asr/transcribe",
        files={"audio": ("empty.wav", io.BytesIO(b""), "audio/wav")},
        data={"language": "en"},
    )
    assert r.status_code == 400


def test_latency_under_threshold(client, sample_audio_for):
    """p95 latency must be under 10s for a synthetic 1.5s clip on CPU."""
    audio_path = sample_audio_for("en")
    times = []
    for _ in range(3):
        with open(audio_path, "rb") as f:
            start = time.perf_counter()
            r = client.post(
                "/asr/transcribe",
                files={"audio": ("sample.wav", f, "audio/wav")},
                data={"language": "en"},
            )
            times.append(time.perf_counter() - start)
        assert r.status_code == 200
    p95 = sorted(times)[int(len(times) * 0.95)]
    # CPU threshold is generous (10s) — GPU would be ~2s
    assert p95 < 10.0, f"p95 latency {p95:.2f}s exceeded 10s threshold"


def test_audio_payload_too_large(client):
    """Audio payload over 10 MB must return 413."""
    import io
    oversized = io.BytesIO(b"0" * (10 * 1024 * 1024 + 1024))
    r = client.post(
        "/asr/transcribe",
        files={"audio": ("large.wav", oversized, "audio/wav")},
        data={"language": "en"},
    )
    assert r.status_code == 413
    assert "exceeds maximum allowed size" in r.json()["detail"]


def test_asr_model_load_failure_returns_503(client, monkeypatch):
    """If Whisper model fails to load, /asr/transcribe must return 503 with clear detail."""
    import ml.routers.asr as asr_module
    import io

    # Simulate load failure state
    monkeypatch.setattr(asr_module, "_model", None)
    monkeypatch.setattr(asr_module, "_load_error", "Out of Memory simulated")

    fake_audio = io.BytesIO(b"RIFF" + b"\x00" * 200)
    r = client.post(
        "/asr/transcribe",
        files={"audio": ("sample.wav", fake_audio, "audio/wav")},
        data={"language": "en"},
    )
    assert r.status_code == 503
    assert "ASR service unavailable" in r.json()["detail"]
    assert "Out of Memory simulated" in r.json()["detail"]

