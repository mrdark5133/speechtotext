# Stage 1: Build the React SPA frontend
FROM node:22-alpine AS web
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Python runtime with pre-downloaded Whisper model
FROM python:3.12-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=10000 \
    HF_HUB_DISABLE_SYMLINKS_WARNING=1

# Install system audio utilities & dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY ml/requirements.txt ml/requirements.txt
RUN pip install --no-cache-dir -r ml/requirements.txt

# Bake Whisper model checkpoint at build time (Zero runtime downloads on cold start)
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"

# Copy backend code, data, and built frontend
COPY ml/ ml/
COPY data/ data/
COPY --from=web /app/dist dist/

EXPOSE 10000

CMD ["sh", "-c", "uvicorn ml.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
