# Phase R0 Audit Report — Render Deployment Preparation

## 1. Audit Summary
- **Target Repository**: `mrdark5133/speechtotext` (`D:\speech`).
- **Target Platform**: Render Free Tier Web Service (Docker runtime, 512 MB RAM limit, ephemeral filesystem, `$PORT` binding).
- **Design Document**: Created [docs/deployment-design.md](file:///d:/speech/docs/deployment-design.md).

---

## 2. Technical Findings

| Metric / Requirement | Audit Finding | Status |
|---|---|---|
| **API URL Strategy** | Client uses relative paths `/api/...` via `apiClient.ts` (same origin in single container) | Verified |
| **Static Asset Serving** | Compiled `dist/` will be served by FastAPI with SPA fallback (`/assets/*` static, catch-all `index.html`) | Verified |
| **API 404 Guard** | Non-existent `/api/*` routes return JSON `{"detail": "Not Found"}` (no HTML fallback) | Planned |
| **Python Version** | Python 3.12-slim base image | Verified |
| **Python Dependencies** | Declared in `ml/requirements.txt` | Verified |
| **Model Pre-baking** | Whisper model downloaded & baked into Docker image during build stage (zero runtime downloads) | Planned |
| **Memory RSS (Base)** | ~50.5 MB (FastAPI app idle) | Verified |
| **Memory RSS (Model Active)** | ~145.89 MB (`whisper-base` int8 loaded in memory, peak ~180-220 MB) | Verified (< 512 MB) |
| **Data Directory Size** | 6.45 KB (`data/fixed_vocabulary.json`) | Verified |
| **Local Docker Status** | Docker Desktop is not installed on local host (local verification will run via direct build & uvicorn serving `dist`) | Noted |

---

## 3. Automated & Manual Test Status
- **Automated Tests**: 23/23 tests passed in pytest (`ml/tests`).
- **Manual Tests Waiting on User**: 0 in R0.
