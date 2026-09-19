# Render Deployment Guide: VaaniSetu Multilingual Speech Platform

## 1. Overview
This project is configured to deploy to **Render (Free Web Service Tier)** using a single multi-stage Docker container that runs both the Python FastAPI ML backend and serves the compiled React frontend from a single URL on port `$PORT` (default `10000`).

---

## 2. Deployment Methods

### Method A: Blueprint Deployment (Recommended)
1. Push your latest code to your GitHub repository:
   ```bash
   git add .
   git commit -m "deploy: prepare for Render Docker service"
   git push origin main
   ```
2. Log in to [Render Dashboard](https://dashboard.render.com/).
3. Click **"New +"** -> **"Blueprint"**.
4. Connect your GitHub repository (`speechtotext` or `deaf_problem`).
5. Render will automatically detect `render.yaml` and create the `vaanisetu-speech` web service.
6. Click **"Apply"**.

### Method B: Manual Web Service Deployment
1. Click **"New +"** -> **"Web Service"**.
2. Select your repository.
3. Configure the following settings:
   - **Name**: `vaanisetu-speech`
   - **Environment / Runtime**: `Docker`
   - **Region**: `Singapore` (or closest to target users)
   - **Branch**: `main`
   - **Plan Type**: `Free` (512 MB RAM, 0.1 CPU)
   - **Health Check Path**: `/health`
4. In **Environment Variables**, add:
   - `PORT`: `10000`
   - `WHISPER_MODEL_SIZE`: `small` (or `base` if memory headroom > 350 MB is required)
   - `WHISPER_DEVICE`: `cpu`
5. Click **"Create Web Service"**.

---

## 3. Build & Operational Expectations
- **Initial Build Time**: **~3 to 5 minutes** (Node.js builds frontend assets; Python downloads packages and bakes Whisper int8 model weights into the container image).
- **Subsequent Build Time**: **~1 to 2 minutes** (cached layers).
- **Cold Start Duration**: **~50 to 60 seconds** after 15 minutes of inactivity on the Render free tier.
- **Microphone & Camera Permissions**: Render automatically provisions TLS/HTTPS (`https://<app-name>.onrender.com`), which is required by modern browsers to grant Web Audio / MediaDevices microphone access.

---

## 4. How to Redeploy & Roll Back

### Redeploying Updates
- Pushes to the `main` branch trigger an automatic zero-downtime rebuild if auto-deploy is enabled.
- To trigger a manual deploy: In Render Dashboard, open your service and click **"Manual Deploy"** -> **"Deploy latest commit"** (or **"Clear build cache & deploy"** if dependencies changed).

### Rolling Back to a Previous Deploy
1. Open your service in the Render Dashboard.
2. Navigate to the **"Events"** or **"Deploys"** tab.
3. Locate the last known good deploy.
4. Click the three dots (`...`) next to that deploy and select **"Rollback to this deploy"**.

---

## 5. Pre-Demo Checklist (Mandatory for Presentations)

- [ ] **Wake Up Service Early**: Open the live Render URL at least **5 minutes before the demo** to trigger the initial container spin-up from cold sleep.
- [ ] **Run Live Smoke Test**: Run the automated test script against the production URL:
  ```bash
  python scripts/smoke_test.py https://<your-service-name>.onrender.com
  ```
  Ensure all 10 checks return `[PASS]`.
- [ ] **Browser Compatibility**: Test in **Google Chrome** or **Microsoft Edge** on a laptop/desktop with a working microphone.
- [ ] **Microphone Permission**: Allow browser microphone access on `https://<your-service-name>.onrender.com`.
- [ ] **Code Freeze**: **Do not push any code during the final 60 minutes before the demo presentation**.
