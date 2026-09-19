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


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ml.routers.asr import router as asr_router
from ml.routers.tts import router as tts_router

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

app.include_router(asr_router)
app.include_router(tts_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "VaaniSetu ML Service"}

