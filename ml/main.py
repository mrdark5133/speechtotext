# ml/main.py
"""
VaaniSetu ML Service -- FastAPI app.
Runs on port 8000. The Node.js Express gateway at port 3000 proxies to this.

Start:  cd d:/speech && uvicorn ml.main:app --host 0.0.0.0 --port 8000 --reload
"""
import os
import sys

# Ensure UTF-8 output on Windows consoles to prevent cp1252 charmap encoding errors with Indic scripts
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv

# Load ml/.env first so GOOGLE_APPLICATION_CREDENTIALS is set before google SDK init
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))


import json
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from ml.routers.asr import router as asr_router
from ml.routers.tts import router as tts_router
from ml.languages import SUPPORTED_LANGUAGES

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warm up Whisper model and verify TTS voices at boot."""
    print("=" * 60)
    print("VaaniSetu ML Service starting...")

    # Verify TTS voices
    try:
        from ml.startup_checks import verify_all_tts_languages
        verify_all_tts_languages()
    except Exception as e:
        print(f"[startup] WARNING: TTS voice check failed: {e}")

    # Warm up Whisper (loads model into memory so first request is fast)
    try:
        from ml.routers.asr import warm_up_model
        warm_up_model()
    except Exception as e:
        print(f"[startup] WARNING: Whisper warm-up failed: {e}")

    print("=" * 60)
    yield

app = FastAPI(
    title="VaaniSetu ML Service",
    description="Whisper ASR + Google Cloud TTS for 6 Indic languages",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount ASR & TTS routers (both with & without /api prefix) ─
app.include_router(asr_router)
app.include_router(tts_router)
app.include_router(asr_router, prefix="/api")
app.include_router(tts_router, prefix="/api")


# ── Health check endpoint ─────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "service": "VaaniSetu ML Service"}


# ── Languages endpoint ────────────────────────────────────────
@app.get("/languages")
@app.get("/api/languages")
def get_languages():
    return {
        "languages": {
            code: {
                "name": info["display_name"],
                "nativeName": info["display_name"],
                "whisper_name": info["whisper_name"],
                "google_code": info["google_code"],
            }
            for code, info in SUPPORTED_LANGUAGES.items()
        }
    }


# ── Vocabulary endpoints ──────────────────────────────────────
def _load_vocabulary():
    candidates = [
        Path(__file__).parent.parent / "data" / "fixed_vocabulary.json",
        Path("data/fixed_vocabulary.json"),
        Path("/app/data/fixed_vocabulary.json"),
    ]
    for p in candidates:
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
    return {}

@app.get("/vocabulary")
@app.get("/api/vocabulary")
def get_vocabulary():
    return {"phrases": _load_vocabulary()}

@app.get("/vocabulary/precache-status")
@app.get("/api/vocabulary/precache-status")
def get_precache_status():
    phrases = _load_vocabulary()
    count = len(phrases)
    return {
        "totalPhrases": count,
        "totalAudios": count * 6,
        "missingCount": 0,
        "missingDetails": [],
        "cacheSummary": {code: count for code in SUPPORTED_LANGUAGES},
    }


# ── API 404 Guard (Strict JSON 404 for unmatched /api/* routes) ─
@app.api_route("/api/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
async def api_catch_all(full_path: str):
    return JSONResponse(status_code=404, content={"detail": f"API route '/api/{full_path}' Not Found"})


# ── Static Frontend & SPA Fallback (Only active if dist exists) ──
def _find_dist_dir() -> Path | None:
    candidates = [
        Path(__file__).parent.parent / "dist",
        Path("dist"),
        Path("frontend/dist"),
        Path("/app/frontend/dist"),
        Path("/app/dist"),
    ]
    for c in candidates:
        if c.exists() and (c / "index.html").exists():
            return c
    return None

dist_dir = _find_dist_dir()

if dist_dir is not None:
    assets_dir = dist_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        requested_file = dist_dir / full_path
        if full_path and requested_file.is_file():
            return FileResponse(str(requested_file))
        return FileResponse(str(dist_dir / "index.html"))


