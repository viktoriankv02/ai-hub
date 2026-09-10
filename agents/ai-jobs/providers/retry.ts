export interface RetryOptions {
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = Math.max(0, Math.floor(options.maxRetries ?? 2));
  const baseDelay = Math.max(0, options.retryBaseDelayMs ?? 500);
  const maxDelay = Math.max(baseDelay, options.retryMaxDelayMs ?? 8_000);

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= maxRetries || !(error instanceof Error) || !("retryable" in error) || (error as { retryable?: boolean }).retryable !== true) {
        throw error;
      }

      const backoff = Math.min(maxDelay, baseDelay * 2 ** attempt);
      const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(backoff * 0.25)));
      await delay(backoff + jitter);
    }
  }
}
