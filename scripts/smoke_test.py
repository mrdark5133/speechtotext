#!/usr/bin/env python3
"""
Production Smoke Test Script for Render Deployment
Usage: python scripts/smoke_test.py [base_url]
Default base_url: http://localhost:10000
"""
import sys
import os
import json
import urllib.request
import urllib.error
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE_URL = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:10000"

passed = 0
failed = 0

def check(name: str, passed_condition: bool, details: str = ""):
    global passed, failed
    if passed_condition:
        passed += 1
        print(f"  [PASS] {name} {details}")
    else:
        failed += 1
        print(f"  [FAIL] {name} {details}")

print("=" * 65)
print(f"Running Production Smoke Test against: {BASE_URL}")
print("=" * 65)

# 1. Health Check
try:
    start = time.perf_counter()
    r = urllib.request.urlopen(f"{BASE_URL}/health", timeout=10)
    latency = int((time.perf_counter() - start) * 1000)
    data = json.loads(r.read().decode())
    check("1. /health", r.status == 200 and data.get("status") == "ok", f"({latency}ms)")
except Exception as e:
    check("1. /health", False, str(e))

# 2. Languages API
try:
    start = time.perf_counter()
    r = urllib.request.urlopen(f"{BASE_URL}/api/languages", timeout=10)
    latency = int((time.perf_counter() - start) * 1000)
    data = json.loads(r.read().decode())
    count = len(data.get("languages", {}))
    check("2. /api/languages", r.status == 200 and count == 6, f"({count} languages, {latency}ms)")
except Exception as e:
    check("2. /api/languages", False, str(e))

# 3. Vocabulary API
try:
    start = time.perf_counter()
    r = urllib.request.urlopen(f"{BASE_URL}/api/vocabulary", timeout=10)
    latency = int((time.perf_counter() - start) * 1000)
    data = json.loads(r.read().decode())
    count = len(data.get("phrases", {}))
    check("3. /api/vocabulary", r.status == 200 and count > 0, f"({count} phrases, {latency}ms)")
except Exception as e:
    check("3. /api/vocabulary", False, str(e))

# 4. TTS Health API
try:
    start = time.perf_counter()
    r = urllib.request.urlopen(f"{BASE_URL}/api/tts/health", timeout=10)
    latency = int((time.perf_counter() - start) * 1000)
    data = json.loads(r.read().decode())
    check("4. /api/tts/health", r.status == 200 and data.get("status") == "ok", f"({latency}ms)")
except Exception as e:
    check("4. /api/tts/health", False, str(e))

# 5. ASR Health API
try:
    start = time.perf_counter()
    r = urllib.request.urlopen(f"{BASE_URL}/api/asr/health", timeout=10)
    latency = int((time.perf_counter() - start) * 1000)
    data = json.loads(r.read().decode())
    check("5. /api/asr/health", r.status == 200 and data.get("status") == "ready", f"({latency}ms)")
except Exception as e:
    check("5. /api/asr/health", False, str(e))

# 6. Sample TTS Synthesis
try:
    start = time.perf_counter()
    payload = json.dumps({"text": "Hello, welcome to VaaniSetu.", "language": "en"}).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/api/tts/synthesize",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    r = urllib.request.urlopen(req, timeout=15)
    latency = int((time.perf_counter() - start) * 1000)
    audio = r.read()
    check("6. /api/tts/synthesize", r.status == 200 and len(audio) > 1000, f"({len(audio)} bytes, {latency}ms, voice: {r.headers.get('X-Voice-Name')})")
except Exception as e:
    check("6. /api/tts/synthesize", False, str(e))

# 7. Root SPA serving (index.html)
try:
    start = time.perf_counter()
    r = urllib.request.urlopen(f"{BASE_URL}/", timeout=10)
    latency = int((time.perf_counter() - start) * 1000)
    content = r.read().decode("utf-8", errors="ignore")
    check("7. Root SPA /", r.status == 200 and "<div id=\"root\">" in content, f"({latency}ms)")
except Exception as e:
    check("7. Root SPA /", False, str(e))

# 8. SPA Route Fallback (/recorder)
try:
    start = time.perf_counter()
    r = urllib.request.urlopen(f"{BASE_URL}/recorder", timeout=10)
    latency = int((time.perf_counter() - start) * 1000)
    content = r.read().decode("utf-8", errors="ignore")
    check("8. SPA Fallback /recorder", r.status == 200 and "<div id=\"root\">" in content, f"({latency}ms)")
except Exception as e:
    check("8. SPA Fallback /recorder", False, str(e))

# 9. Static JS Asset Serving
try:
    start = time.perf_counter()
    # Find any JS asset in dist/assets
    assets = [f for f in os.listdir("dist/assets") if f.endswith(".js")] if os.path.exists("dist/assets") else []
    if assets:
        js_file = assets[0]
        r = urllib.request.urlopen(f"{BASE_URL}/assets/{js_file}", timeout=10)
        latency = int((time.perf_counter() - start) * 1000)
        check(f"9. Static Asset /assets/{js_file}", r.status == 200 and len(r.read()) > 1000, f"({latency}ms)")
    else:
        check("9. Static Asset", False, "No JS files found in dist/assets")
except Exception as e:
    check("9. Static Asset", False, str(e))

# 10. API 404 Guard (unmatched /api/* must return JSON 404)
try:
    start = time.perf_counter()
    req = urllib.request.Request(f"{BASE_URL}/api/nonexistent_test_route_404")
    try:
        r = urllib.request.urlopen(req, timeout=10)
        check("10. API 404 Guard", False, f"Expected 404 but got {r.status}")
    except urllib.error.HTTPError as he:
        latency = int((time.perf_counter() - start) * 1000)
        body = json.loads(he.read().decode())
        is_json_404 = he.code == 404 and "detail" in body
        check("10. API 404 Guard", is_json_404, f"(HTTP 404 JSON, {latency}ms)")
except Exception as e:
    check("10. API 404 Guard", False, str(e))

print("=" * 65)
print(f"Summary: {passed} passed, {failed} failed")
print("=" * 65)

if failed > 0:
    sys.exit(1)
else:
    print("ALL SMOKE TESTS PASSED!")
    sys.exit(0)
