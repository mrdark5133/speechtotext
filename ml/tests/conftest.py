# ml/tests/conftest.py
"""
Shared pytest fixtures for ASR and TTS tests.
"""
import io
import os
import struct
import wave
import pytest
from httpx import AsyncClient, ASGITransport

from ml.main import app


@pytest.fixture
def client():
    """Synchronous TestClient wrapper around the FastAPI app."""
    from fastapi.testclient import TestClient
    return TestClient(app)


@pytest.fixture
def async_client():
    """Async httpx client for async tests."""
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.fixture
def sample_audio_for(tmp_path):
    """
    Factory fixture: returns a function that generates a synthetic WAV
    for the given language code. The WAV is a 1.5-second mono 16kHz PCM clip
    with a harmonic tone (realistic enough for Whisper to process without errors).
    """
    import math

    def _make_wav(lang_code: str) -> str:
        sample_rate = 16000
        duration    = 1.5
        n_samples   = int(sample_rate * duration)

        # Different base frequency per language so test clips are distinguishable
        freq_map = {"en": 220, "hi": 261, "ta": 293, "te": 329, "kn": 349, "bn": 392}
        f0 = freq_map.get(lang_code, 220)

        samples = []
        for i in range(n_samples):
            t = i / sample_rate
            val = (
                math.sin(2 * math.pi * f0 * t) * 0.5
                + math.sin(2 * math.pi * f0 * 2 * t) * 0.3
                + math.sin(2 * math.pi * f0 * 3 * t) * 0.2
            )
            # Amplitude envelope to avoid click artefacts
            env = math.sin(math.pi * t / duration)
            samples.append(int(val * env * 20000))

        path = str(tmp_path / f"sample_{lang_code}.wav")
        with wave.open(path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(struct.pack(f"<{n_samples}h", *samples))
        return path

    return _make_wav
