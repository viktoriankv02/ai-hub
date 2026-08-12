import type { AIJobExecutionContext } from "../executor.js";
import type { AIJobRecord } from "../types.js";

export interface OpenAICompatibleProviderOptions {
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
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string | number;
  };
};

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\\/+$/, "");
  if (!trimmed) throw new Error("AI provider baseUrl is required");
  return trimmed;
}

function validateFinite(name: string, value: number | undefined, minimum: number): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${name} must be a finite number >= ${minimum}`);
  }
}

/**
 * Provider for OpenAI-compatible `/chat/completions` APIs.
 *
 * This intentionally uses the platform fetch API instead of an SDK so the same
 * adapter can target OpenAI, OpenRouter, Groq, Together and other compatible
 * gateways without coupling AI Hub to a vendor package.
 */
export class OpenAICompatibleProvider implements AIJobExecutionContext {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly systemPrompt?: string;
  private readonly temperature?: number;
  private readonly maxTokens?: number;
  private readonly timeoutMs: number;
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
    this.fetchImpl = options.fetchImpl ?? fetch;

    validateFinite("temperature", this.temperature, 0);
    validateFinite("maxTokens", this.maxTokens, 1);
    validateFinite("timeoutMs", this.timeoutMs, 1);

    if (this.temperature !== undefined && this.temperature > 2) {
      throw new Error("temperature must be <= 2");
    }
    if (this.maxTokens !== undefined && !Number.isInteger(this.maxTokens)) {
      throw new Error("maxTokens must be an integer");
    }
  }

  async executePrompt(job: AIJobRecord): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (this.systemPrompt) messages.push({ role: "system", content: this.systemPrompt });
    messages.push({ role: "user", content: job.prompt });

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
    };
    if (this.temperature !== undefined) body.temperature = this.temperature;
    if (this.maxTokens !== undefined) body.max_tokens = this.maxTokens;

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
        throw new Error(`AI provider HTTP ${response.status}${suffix}`);
      }

      const output = payload?.choices?.[0]?.message?.content;
      if (typeof output !== "string" || !output.trim()) {
        throw new Error("AI provider response contained no text content");
      }

      return output.trim();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`AI provider request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
