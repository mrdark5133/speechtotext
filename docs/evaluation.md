# Speech Pipeline Evaluation & Latency Benchmark Report

## 1. Evaluation Methodology
Latency and accuracy metrics are measured across end-to-end user interactions (ASR speech recognition and TTS speech synthesis) across all 6 supported Indic languages. All latencies include audio decoding, inference, and serialization.

---

## 2. Benchmark Results by Environment

### Environment A: Local Python Runtime (Windows 11, Intel Core i5/AMD, CPU int8)

| Metric / Language | Model / Voice Engine | Latency (ms) | Audio Output Size | Confidence / Status |
|---|---|---|---|---|
| **ASR — English (`en`)** | faster-whisper `whisper-small` (int8) | **1539 ms** | N/A | 0.569 |
| **ASR — Hindi (`hi`)** | faster-whisper `whisper-small` (int8) | **1688 ms** | N/A | 0.601 |
| **ASR — Tamil (`ta`)** | faster-whisper `whisper-small` (int8) | **1966 ms** | N/A | 0.804 |
| **ASR — Telugu (`te`)** | faster-whisper `whisper-small` (int8) | **1796 ms** | N/A | 0.435 |
| **ASR — Kannada (`kn`)** | faster-whisper `whisper-small` (int8) | **1699 ms** | N/A | 0.488 |
| **ASR — Bengali (`bn`)** | faster-whisper `whisper-small` (int8) | **1868 ms** | N/A | 0.566 |
| **TTS — English (`en`)** | `en-IN-NeerjaNeural` | **1229 ms** (first) / **7 ms** (cached) | 18,000 bytes | Verified 100% |
| **TTS — Hindi (`hi`)** | `hi-IN-SwaraNeural` | **1209 ms** (first) / **8 ms** (cached) | 18,288 bytes | Verified 100% |
| **TTS — Tamil (`ta`)** | `ta-IN-PallaviNeural` | **951 ms** (first) / **7 ms** (cached) | 16,128 bytes | Verified 100% |
| **TTS — Telugu (`te`)** | `te-IN-ShrutiNeural` | **949 ms** (first) / **8 ms** (cached) | 14,688 bytes | Verified 100% |
| **TTS — Kannada (`kn`)** | `kn-IN-SapnaNeural` | **900 ms** (first) / **7 ms** (cached) | 16,416 bytes | Verified 100% |
| **TTS — Bengali (`bn`)** | `bn-IN-TanishaaNeural` | **912 ms** (first) / **7 ms** (cached) | 17,424 bytes | Verified 100% |

---

### Environment B: Render Free Tier Production Docker (Pending Live Deployment URL)
*(To be populated post-deployment upon running `python scripts/smoke_test.py <live_url>`)*

| Metric | Target / Expected Value | Measured Render Value |
|---|---|---|
| **Health Check (`/health`)** | < 100 ms | *Pending live deploy* |
| **Cold Start Wake-up Time** | ~50–60 s | *Pending live deploy* |
| **TTS First Synthesis** | ~1.5–2.5 s | *Pending live deploy* |
| **TTS Cached Retrieval** | < 50 ms | *Pending live deploy* |
| **ASR Transcription Latency** | ~2.5–3.5 s (0.1 CPU core) | *Pending live deploy* |

---

## 3. Memory & Resource Profile

- **Base Service Idle RSS**: 69.20 MB
- **Active Memory Footprint (Whisper-small loaded)**: 323.67 MB
- **Safety Margin on Render 512 MB Free Tier**: 188.33 MB (36.7%)
