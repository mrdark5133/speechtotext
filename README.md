# VaaniSetu: Multilingual Speech-to-Text (ASR) & Text-to-Speech (TTS) Platform

> Production-ready AAC multilingual speech platform for 6 Indic languages: **English, Hindi (हिन्दी), Tamil (தமிழ்), Telugu (తెలుగు), Kannada (ಕನ್ನಡ), and Bengali (বাংলা)**.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

---

## 🌐 Live Demo
- **Live Deployment URL**: `https://<your-render-app-name>.onrender.com` *(Replace with your live Render URL after deployment)*
- **Supported Browsers**: Google Chrome, Microsoft Edge (for full Web Audio / MediaDevices microphone capture).
- **Free Tier Cold Start Notice**: Hosted on Render Free Web Service (512 MB RAM). When the service is idle for >15 minutes, it spins down and takes ~50–60 seconds to wake up on the first request. The frontend includes an automatic 90-second retry handler and friendly status notification.

---

## 🏗️ Architecture

- **ASR Engine**: Local `faster-whisper` (CTranslate2 backend with int8 quantization) for fast, self-hostable speech recognition with Voice Activity Detection (VAD) and per-segment confidence scores.
- **TTS Engine**: Dual-engine architecture with **Google Cloud Text-to-Speech** (Neural2 / Wavenet) as primary and **Neural Edge-TTS** fallback for 100% zero-credential uptime.
- **Caching Layer**: In-memory SHA-256 audio cache for instant sub-10ms replay of synthesized phrases.
- **Deployment**: Single multi-stage Docker container serving both FastAPI ML endpoints and compiled React SPA frontend.

---

## 🚀 Local Development

### Prerequisites
- Node.js 20+
- Python 3.12+ (or 3.13)
- `ffmpeg` (for local audio decoding)

### 1. Install Dependencies
```bash
npm install
pip install -r ml/requirements.txt
```

### 2. Run Local Development Server
```bash
# Terminal 1: Start Python FastAPI ML Service
python -m uvicorn ml.main:app --host 0.0.0.0 --port 8001 --reload

# Terminal 2: Start Express Gateway & Vite Frontend
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing & Verification

Run the automated test suites:
```bash
# Run 28 pytest unit and deployment tests
python -m pytest ml/tests -v

# Run production smoke test against local or live service
python scripts/smoke_test.py http://localhost:10000
python scripts/smoke_test.py https://<your-app>.onrender.com
```

---

## 📦 Deployment to Render

See the step-by-step guide in [docs/deployment.md](docs/deployment.md).

