/**
 * API client with Render cold-start wake-up handling (up to 90s retries),
 * AI Studio authentication propagation, and robust error recovery.
 */

type ServerStateListener = (isWakingUp: boolean, message?: string) => void;
const listeners: Set<ServerStateListener> = new Set();

export function subscribeServerState(listener: ServerStateListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyServerState(isWakingUp: boolean, message?: string) {
  listeners.forEach((fn) => fn(isWakingUp, message));
}

export function getApiUrl(path: string): string {
  if (typeof window === "undefined") return path;

  const [base, existingQuery] = path.split("?");
  const searchParams = new URLSearchParams(existingQuery || "");

  if (window.location && window.location.search) {
    const pageParams = new URLSearchParams(window.location.search);
    const authKeys = ["__aistudio_auth_token", "__session_index", "__storage_access_granted"];
    for (const key of authKeys) {
      const val = pageParams.get(key);
      if (val && !searchParams.has(key)) {
        searchParams.set(key, val);
      }
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `${base}?${queryString}` : base;
}

export async function apiFetch(
  path: string,
  init?: RequestInit,
  maxDurationMs: number = 90000 // 90 seconds budget for cold start wake-up
): Promise<Response> {
  const url = getApiUrl(path);
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  const options: RequestInit = {
    credentials: "include",
    ...init,
  };

  const startTime = Date.now();
  let attempt = 0;
  let lastError: any = null;

  while (Date.now() - startTime < maxDurationMs) {
    attempt++;
    try {
      const response = await fetch(url, options);
      const contentType = response.headers.get("content-type") || "";

      const isApiRoute =
        path.startsWith("/api/") ||
        path.startsWith("/asr/") ||
        path.startsWith("/tts/") ||
        path.startsWith("/vocabulary/");
      const isHtmlOnApi = isApiRoute && contentType.includes("text/html");
      const isWakingUpStatus =
        response.status === 502 || response.status === 503 || response.status === 504;

      if (isWakingUpStatus || isHtmlOnApi) {
        notifyServerState(true, "Server is waking up (up to ~1 minute)...");
        if (isFormData && attempt >= 2) {
          // Avoid exhausting multipart form body if stream consumed
          throw new Error("Server is waking up. Please try submitting again in a moment.");
        }
        await new Promise((r) => setTimeout(r, Math.min(2500, 800 * attempt)));
        continue;
      }

      // Success!
      notifyServerState(false);
      return response;
    } catch (err: any) {
      lastError = err;
      notifyServerState(true, "Server is waking up (up to ~1 minute)...");
      if (isFormData && attempt >= 2) {
        break;
      }
      await new Promise((r) => setTimeout(r, Math.min(2500, 800 * attempt)));
    }
  }

  notifyServerState(false);
  throw lastError || new Error(`Network request timed out for ${path} after 90s.`);
}

