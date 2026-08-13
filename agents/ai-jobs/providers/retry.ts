export interface RetryOptions {
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelay = options.retryBaseDelayMs ?? 500;
  const maxDelay = options.retryMaxDelayMs ?? 8_000;

  if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new Error("maxRetries must be an integer >= 0");
  if (!Number.isFinite(baseDelay) || baseDelay < 0) throw new Error("retryBaseDelayMs must be a finite number >= 0");
  if (!Number.isFinite(maxDelay) || maxDelay < baseDelay) throw new Error("retryMaxDelayMs must be finite and >= retryBaseDelayMs");

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= maxRetries) throw error;
      if (error instanceof Error && "retryable" in error && (error as { retryable?: unknown }).retryable === false) throw error;
      await sleep(Math.min(maxDelay, baseDelay * 2 ** attempt));
    }
  }
}
