import type { AIJobExecutionContext } from "../executor.js";
import type { AIJobRecord } from "../types.js";
import { isRetryableStatus, withRetry, type RetryOptions } from "./retry.js";
import { AIProviderError, type AIProvider, type AIProviderRequest, type AIProviderResponse } from "./types.js";

export interface OpenAICompatibleProviderOptions extends RetryOptions {
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
  choices?: Array<{
    message?: { content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string | number;
  };
};

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) throw new Error("AI provider baseUrl is required");
  return trimmed;
}

function validateFinite(name: string, value: number | undefined, minimum: number): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${name} must be a finite number >= ${minimum}`);
  }
}

export class OpenAICompatibleProvider implements AIProvider, AIJobExecutionContext {
  readonly name = "openai-compatible";

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly systemPrompt?: string;
  private readonly temperature?: number;
  private readonly maxTokens?: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly retryOptions: RetryOptions;

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
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.retryOptions = {
      maxRetries: options.maxRetries ?? 2,
      retryBaseDelayMs: options.retryBaseDelayMs ?? 500,
      retryMaxDelayMs: options.retryMaxDelayMs ?? 8_000,
    };

    validateFinite("temperature", this.temperature, 0);
    validateFinite("maxTokens", this.maxTokens, 1);
    validateFinite("timeoutMs", this.timeoutMs, 1);

    if (this.temperature !== undefined && this.temperature > 2) throw new Error("temperature must be <= 2");
    if (this.maxTokens !== undefined && !Number.isInteger(this.maxTokens)) throw new Error("maxTokens must be an integer");
  }

  async execute(request: AIProviderRequest, signal?: AbortSignal): Promise<AIProviderResponse> {
    return withRetry((attempt) => this.request(request, signal, attempt), this.retryOptions);
  }

  async executePrompt(job: AIJobRecord): Promise<string> {
    const messages: AIProviderRequest["messages"] = [];
    if (this.systemPrompt) messages.push({ role: "system", content: this.systemPrompt });
    messages.push({ role: "user", content: job.prompt });

    const result = await this.execute({
      model: this.model,
      messages,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
    });
    return result.output;
  }

  private async request(request: AIProviderRequest, parentSignal: AbortSignal | undefined, attempt: number): Promise<AIProviderResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort(parentSignal?.reason);
    parentSignal?.addEventListener("abort", onAbort, { once: true });

    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const requestId = response.headers.get("x-request-id") ?? undefined;
      const raw = await response.text();
      let payload: ChatCompletionResponse | undefined;
      try {
        payload = raw ? (JSON.parse(raw) as ChatCompletionResponse) : undefined;
      } catch {
        payload = undefined;
      }

      if (!response.ok) {
        const providerMessage = payload?.error?.message?.trim();
        const suffix = providerMessage ? `: ${providerMessage}` : "";
        throw new AIProviderError({
          provider: this.name,
          status: response.status,
          requestId,
          retryable: isRetryableStatus(response.status),
          message: `AI provider HTTP ${response.status}${suffix} (attempt ${attempt + 1})`,
        });
      }

      const output = payload?.choices?.[0]?.message?.content;
      if (typeof output !== "string" || !output.trim()) {
        throw new AIProviderError({
          provider: this.name,
          requestId,
          message: "AI provider response contained no text content",
        });
      }

      return {
        output: output.trim(),
        requestId,
        model: payload?.model,
        usage: {
          inputTokens: payload?.usage?.prompt_tokens,
          outputTokens: payload?.usage?.completion_tokens,
          totalTokens: payload?.usage?.total_tokens,
        },
      };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new AIProviderError({
          provider: this.name,
          message: `AI provider request timed out after ${this.timeoutMs}ms`,
          retryable: true,
          cause: error,
        });
      }
      throw new AIProviderError({
        provider: this.name,
        message: error instanceof Error ? error.message : "AI provider request failed",
        retryable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
      parentSignal?.removeEventListener("abort", onAbort);
    }
  }
}
