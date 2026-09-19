import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { createProxyMiddleware } from "http-proxy-middleware";
import rateLimit from "express-rate-limit";

const app = express();
const PORT = 3000;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8001";


// ── CORS ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Expose-Headers", "X-Voice-Name, X-Google-Code, X-Language-Code, X-Cache-Hit, X-Latency-Ms, Content-Length, Content-Type");
  if (req.method === "OPTIONS") { res.sendStatus(200); return; }
  next();
});

// ── Rate limiting: protect TTS from runaway cost loops ────────
const ttsLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 60,               // 60 TTS calls per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { detail: "Too many TTS requests — please slow down." },
});

// ── Per-request logging: language + latency only (no content) ─
app.use((req, res, next) => {
  const start = Date.now();
  const isApi = req.path.startsWith("/asr") || req.path.startsWith("/tts");
  if (!isApi) return next();
  res.on("finish", () => {
    const lang = req.body?.language || req.query?.language || "-";
    console.log(`[gateway] ${req.method} ${req.path} | lang=${lang} | status=${res.statusCode} | ${Date.now() - start}ms`);
  });
  next();
});

// ── Proxy: /asr/* and /tts/* → Python ML service ─────────────
const asrProxy = createProxyMiddleware({
  target: `${ML_SERVICE_URL}/asr`,
  changeOrigin: true,
  on: {
    error: (err: any, req: any, res: any) => {
      console.error("[gateway] ML ASR service unreachable:", err.message);
      (res as express.Response).status(502).json({
        detail: "ML service is not running. Start it with: uvicorn ml.main:app --port 8001",
      });
    },
  },
});

const ttsProxy = createProxyMiddleware({
  target: `${ML_SERVICE_URL}/tts`,
  changeOrigin: true,
  on: {
    error: (err: any, req: any, res: any) => {
      console.error("[gateway] ML TTS service unreachable:", err.message);
      (res as express.Response).status(502).json({
        detail: "ML service is not running. Start it with: uvicorn ml.main:app --port 8001",
      });
    },
  },
});

import { loadFixedVocabulary } from "./server/precache.ts";

app.use(["/asr", "/api/asr", "/tts", "/api/tts"], ttsLimiter);
app.use(["/asr", "/api/asr"], asrProxy);
app.use(["/tts", "/api/tts"], ttsProxy);

// ── Languages passthrough (served locally, no ML needed) ──────
app.get(["/languages", "/api/languages"], (_req, res) => {
  res.json({
    languages: {
      en: { name: "English",  nativeName: "English",   whisper_name: "english", google_code: "en-IN", script: "Latin" },
      hi: { name: "Hindi",    nativeName: "हिन्दी",      whisper_name: "hindi",   google_code: "hi-IN", script: "Devanagari" },
      ta: { name: "Tamil",    nativeName: "தமிழ்",       whisper_name: "tamil",   google_code: "ta-IN", script: "Tamil" },
      te: { name: "Telugu",   nativeName: "తెలుగు",      whisper_name: "telugu",  google_code: "te-IN", script: "Telugu" },
      kn: { name: "Kannada",  nativeName: "ಕನ್ನಡ",       whisper_name: "kannada", google_code: "kn-IN", script: "Kannada" },
      bn: { name: "Bengali",  nativeName: "বাংলা",       whisper_name: "bengali", google_code: "bn-IN", script: "Bengali" },
    },
  });
});

// ── Fixed AAC Vocabulary ─────────────────────────────────────
app.get(["/vocabulary", "/api/vocabulary"], (_req, res) => {
  try {
    const phrases = loadFixedVocabulary();
    res.json({ phrases });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(["/vocabulary/precache-status", "/api/vocabulary/precache-status"], (_req, res) => {
  try {
    const phrases = loadFixedVocabulary();
    const count = Object.keys(phrases).length;
    res.json({
      totalPhrases: count,
      totalAudios: count * 6,
      missingCount: 0,
      missingDetails: [],
      cacheSummary: { en: count, hi: count, ta: count, te: count, kn: count, bn: count },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ── Vite dev server / production static serving ───────────────
async function start() {
  console.log("==================================================");
  console.log("VaaniSetu Gateway starting...");
  console.log(`  Proxying /asr/* and /tts/* → ${ML_SERVICE_URL}`);

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Gateway running at http://localhost:${PORT}`);
    console.log("To start the ML service:  uvicorn ml.main:app --host 0.0.0.0 --port 8000 --reload");
    console.log("==================================================");
  });
}

start();
