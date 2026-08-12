import { DryRunAIExecutor, type AIJobExecutor } from "./executor.js";
import { OpenAICompatibleProvider } from "./providers/openai-compatible.js";

export type AIJobExecutorMode = "dry-run" | "openai-compatible";

export interface AIJobRuntimeOptions {
  mode?: AIJobExecutorMode;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

function numberFromEnv(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`invalid numeric environment value: ${value}`);
  return parsed;
}

/**
 * Builds the executor used by the HTTP server and persistent worker.
 * Dry-run remains the default so local development never spends money or
 * leaks prompts to a third-party provider accidentally.
 */
export function createAIJobExecutor(options: AIJobRuntimeOptions = {}): AIJobExecutor {
  const mode = options.mode ?? (process.env.AI_JOB_EXECUTOR as AIJobExecutorMode | undefined) ?? "dry-run";

  if (mode === "dry-run") return new DryRunAIExecutor();
  if (mode !== "openai-compatible") {
    throw new Error(`unsupported AI_JOB_EXECUTOR: ${mode}`);
  }

  const apiKey = options.apiKey ?? process.env.AI_PROVIDER_API_KEY;
  const model = options.model ?? process.env.AI_PROVIDER_MODEL;
  if (!apiKey?.trim()) throw new Error("AI_PROVIDER_API_KEY is required for openai-compatible executor");
  if (!model?.trim()) throw new Error("AI_PROVIDER_MODEL is required for openai-compatible executor");

  return new OpenAICompatibleProvider({
    apiKey,
    model,
    baseUrl: options.baseUrl ?? process.env.AI_PROVIDER_BASE_URL,
    systemPrompt: options.systemPrompt ?? process.env.AI_PROVIDER_SYSTEM_PROMPT,
    temperature: options.temperature ?? numberFromEnv(process.env.AI_PROVIDER_TEMPERATURE),
    maxTokens: options.maxTokens ?? numberFromEnv(process.env.AI_PROVIDER_MAX_TOKENS),
    timeoutMs: options.timeoutMs ?? numberFromEnv(process.env.AI_PROVIDER_TIMEOUT_MS),
  }) as unknown as AIJobExecutor;
}
