interface FetchJsonTimeoutOptions {
  timeoutMs: number;
  provider: string;
  operation: string;
}

export async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  { timeoutMs, provider, operation }: FetchJsonTimeoutOptions,
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    if (controller.signal.aborted) {
      console.warn(JSON.stringify({
        event: "provider_request_timeout",
        operation,
        provider,
        timeoutMs,
      }));
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
