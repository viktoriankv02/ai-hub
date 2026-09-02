import type { AIJobExecutionContext } from "../executor.js";
import type { AIJobRecord } from "../types.js";
import { AIProviderError, type AIProvider, type AIProviderRequest, type AIProviderResponse, type AIProviderRetryOptions } from "./types.js";

export interface OpenAICompatibleProviderOptions extends AIProviderRetryOptions {
  apiKey: string;
  baseUrl?: string;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

type ChatCompletionResponse = {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string; type?: string; code?: string | number };
};

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("AI provider baseUrl is required");
  return trimmed;
}

function validateFinite(name: string, value: number | undefined, minimum: number): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < minimum) throw new Error(`${name} must be a finite number >= ${minimum}`);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    const onAbort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Vendor-neutral adapter for OpenAI-compatible `/chat/completions` APIs. */
export class OpenAICompatibleProvider implements AIJobExecutionContext, AIProvider {
  readonly name = "openai-compatible";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly systemPrompt?: string;
  private readonly temperature?: number;
  private readonly maxTokens?: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly retryMaxDelayMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) throw new Error("AI provider apiKey is required");
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? "https://api.openai.com/v1");
    this.model = options.model.trim();
    if (!this.model) throw new Error("AI provider model is required");
    this.systemPrompt = options.systemPrompt?.trim() || undefined;
    this.temperature = options.temperature;
    this.maxTokens = options.maxTokens;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    this.retryMaxDelayMs = options.retryMaxDelayMs ?? 8_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    validateFinite("temperature", this.temperature, 0);
    validateFinite("maxTokens", this.maxTokens, 1);
    validateFinite("timeoutMs", this.timeoutMs, 1);
    validateFinite("maxRetries", this.maxRetries, 0);
    validateFinite("retryBaseDelayMs", this.retryBaseDelayMs, 0);
    validateFinite("retryMaxDelayMs", this.retryMaxDelayMs, 0);
    if (this.temperature !== undefined && this.temperature > 2) throw new Error("temperature must be <= 2");
    if (this.maxTokens !== undefined && !Number.isInteger(this.maxTokens)) throw new Error("maxTokens must be an integer");
    if (!Number.isInteger(this.maxRetries)) throw new Error("maxRetries must be an integer");
  }

  private messagesFor(prompt: string): Array<{ role: "system" | "user"; content: string }> {
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (this.systemPrompt) messages.push({ role: "system", content: this.systemPrompt });
    messages.push({ role: "user", content: prompt });
    return messages;
  }

  async execute(request: AIProviderRequest, signal?: AbortSignal): Promise<AIProviderResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const body = JSON.stringify({
      model: request.model || this.model,
      messages: request.messages,
      ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
      ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
    });

    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
            body,
            signal: controller.signal,
          });
          const raw = await response.text();
          let payload: ChatCompletionResponse | undefined;
          try { payload = raw ? JSON.parse(raw) as ChatCompletionResponse : undefined; } catch { payload = undefined; }
          const requestId = payload?.id;
          if (!response.ok) {
            const message = payload?.error?.message?.trim() || `AI provider HTTP ${response.status}`;
            const retryable = isRetryableStatus(response.status);
            if (retryable && attempt < this.maxRetries) {
              await sleep(Math.min(this.retryMaxDelayMs, this.retryBaseDelayMs * 2 ** attempt), controller.signal);
              continue;
            }
            throw new AIProviderError({ provider: this.name, message, status: response.status, requestId, retryable, });
          }
          const output = payload?.choices?.[0]?.message?.content;
          if (typeof output !== "string" || !output.trim()) {
            throw new AIProviderError({ provider: this.name, message: "AI provider response contained no text content", requestId, });
          }
          return {
            output: output.trim(),
            requestId,
            model: payload?.model ?? request.model ?? this.model,
            usage: payload?.usage ? {
              inputTokens: payload.usage.prompt_tokens,
              outputTokens: payload.usage.completion_tokens,
              totalTokens: payload.usage.total_tokens,
            } : undefined,
          };
        } catch (error) {
          if (error instanceof AIProviderError) throw error;
          if (error instanceof Error && error.name === "AbortError") {
            throw new AIProviderError({ provider: this.name, message: `AI provider request timed out after ${this.timeoutMs}ms`, retryable: true, cause: error });
          }
          if (attempt < this.maxRetries) {
            await sleep(Math.min(this.retryMaxDelayMs, this.retryBaseDelayMs * 2 ** attempt), controller.signal);
            continue;
          }
          throw new AIProviderError({ provider: this.name, message: error instanceof Error ? error.message : "AI provider request failed", retryable: true, cause: error });
        }
      }
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  async executePrompt(job: AIJobRecord): Promise<string> {
    const response = await this.execute({
      model: this.model,
      messages: this.messagesFor(job.prompt),
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    });
    return response.output;
  }
}
