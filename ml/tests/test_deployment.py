# ml/tests/test_deployment.py
"""
Tests for production deployment:
- /health endpoint
- /api/languages and /api/vocabulary
- API 404 guard (unmatched /api/* must return JSON 404, not HTML)
- Static SPA fallback
"""
import pytest
from ml.main import app


def test_health_endpoint(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ok"
    assert "asr_loaded" in data
    assert "tts_ready" in data
    assert data["tts_ready"] is True


def test_api_languages_endpoint(client):
    r = client.get("/api/languages")
    assert r.status_code == 200
    data = r.json()
    assert "languages" in data
    assert "hi" in data["languages"]
    assert "en" in data["languages"]


def test_api_vocabulary_endpoint(client):
    r = client.get("/api/vocabulary")
    assert r.status_code == 200
    data = r.json()
    assert "phrases" in data


def test_api_unmatched_route_returns_json_404(client):
    """
    CRITICAL: Unmatched /api/* routes must return JSON 404, NOT HTML index.html.
    """
    r = client.get("/api/nonexistent_route_test_123")
    assert r.status_code == 404
    assert "application/json" in r.headers.get("content-type", "")
    data = r.json()
    assert "detail" in data


def test_spa_static_and_fallback(client):
    """
    Root / and non-API paths should return status 200.
    """
    r = client.get("/")
    assert r.status_code == 200
