/**
 * API client with AI Studio authentication propagation, credentials inclusion,
 * and robust retry handling for preview iframe environments.
 */

export function getApiUrl(path: string): string {
  if (typeof window === "undefined") return path;

  // If the URL already has search params, parse them
  const [base, existingQuery] = path.split("?");
  const searchParams = new URLSearchParams(existingQuery || "");

  // Propagate AI Studio iframe auth parameters so Nginx Lua verification never redirects API calls
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
  maxAttempts: number = 3
): Promise<Response> {
  const url = getApiUrl(path);
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  // Limit retries on FormData to avoid browser "Failed to fetch" on consumed multipart streams
  const effectiveMaxAttempts = isFormData ? 2 : maxAttempts;

  const options: RequestInit = {
    credentials: "include", // Ensure session and partitioned auth cookies are sent
    ...init,
  };

  let lastError: any = null;

  for (let attempt = 1; attempt <= effectiveMaxAttempts; attempt++) {
    try {
      const response = await fetch(url, options);
      const contentType = response.headers.get("content-type") || "";

      // Check if server is warming up, Nginx returned 502/503/504, or returned HTML on an API route
      const isApiRoute = path.startsWith("/api/") || path.startsWith("/asr/") || path.startsWith("/tts/") || path.startsWith("/vocabulary/");
      const isHtmlOnApi = isApiRoute && contentType.includes("text/html");
      const isServerError = response.status >= 500 || response.status === 502 || response.status === 503 || response.status === 504;

      if (isServerError || isHtmlOnApi) {
        if (attempt < effectiveMaxAttempts && !isFormData) {
          await new Promise((r) => setTimeout(r, 600 * attempt));
          continue;
        }
        if (isHtmlOnApi) {
          throw new Error("Speech engine service returned HTML instead of JSON. The backend may still be starting up. Please try again.");
        }
      }

      return response;
    } catch (err: any) {
      lastError = err;
      if (attempt < effectiveMaxAttempts && !isFormData) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      }
    }
  }

  throw lastError || new Error(`Network request failed for ${path}`);
}
