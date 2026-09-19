# Deployment Design: Render Docker Single-Service Architecture

## 1. Overview
This design specifies the deployment of the speech platform as a single Docker container on **Render Free Tier** (512 MB RAM, 0.1 CPU). The container builds the React frontend, packages the Python FastAPI ML and static file server, and exposes a single unified HTTP service on `0.0.0.0:$PORT`.

---

## 2. API Communication & Routing Architecture
- **Frontend API Calls**: The client uses relative URL paths (`/api/tts/synthesize`, `/api/asr/transcribe`, `/api/vocabulary`, `/health`) via `src/utils/apiClient.ts`. No absolute URLs or CORS changes are required because the frontend and backend share the same origin.
- **Development vs. Production**:
  - In development: Express / Vite dev middleware handles hot reloading on port 3000 and proxies API requests.
  - In production: FastAPI (or Node gateway runtime) serves static frontend assets directly from `dist/` and mounts API routes.
- **Routing Rules**:
  - API Routes: `/api/asr/*`, `/api/tts/*`, `/asr/*`, `/tts/*`, `/health`, `/api/vocabulary` registered first.
  - Unmatched API Routes: Any request matching `/api/*` that does not match a known endpoint strictly returns a **JSON 404** `{"detail": "Not Found"}`.
  - Static & SPA Routes: `/assets/*` mapped to static files; all other non-API routes return `dist/index.html` (supporting SPA refresh on `/recorder`, `/vocabulary`, etc.).

---

## 3. Data & Resource Packaging
- **Vocabulary & Language Data**: `data/fixed_vocabulary.json` (6.45 KB) and `ml/languages.py` provide full multilingual phrase mapping.
- **Image Contents**:
  - `dist/` (compiled React SPA HTML/JS/CSS assets).
  - `data/` (vocabulary dataset).
  - `ml/` (FastAPI app, ASR router, TTS router, models).
- **Zero Runtime Downloads**: Whisper models (`whisper-small` / `whisper-base` quantized int8) are cached/baked directly into the container image during build time, ensuring no network latency or build failures on cold start.

---

## 4. Dependencies & Runtime Environment
- **Python Version**: Python 3.12-slim.
- **Dependency Manifest**: Declared in `ml/requirements.txt` (FastAPI, uvicorn, faster-whisper, edge-tts, gTTS, pydantic, python-dotenv).
- **Node.js Build Stage**: Node.js 22-alpine (`npm ci && npm run build`).
- **Entry Point & Command**:
  ```sh
  uvicorn ml.main:app --host 0.0.0.0 --port ${PORT:-10000}
  ```

---

## 5. Memory Audit & Capacity Budget
- **Target Budget**: Render Free Tier = 512 MB RAM.
- **Measured Resident Set Size (RSS)**:
  - Base FastAPI Server RSS: **69.20 MB**
  - FastAPI + faster-whisper (`whisper-small` int8) loaded: **323.67 MB**
  - Total Memory Headroom: **~188 MB (36.7% free memory)** under Render 512 MB ceiling.
- **Data Footprint**: `data/` directory is **6.45 KB**.
- **Cold Start Strategy**:
  - 15-minute idle spin-down handled with a 90-second client waking-up banner and exponential backoff retry mechanism.
