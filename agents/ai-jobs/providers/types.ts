export type AIProviderMessageRole = "system" | "user" | "assistant";

export interface AIProviderMessage {
  role: AIProviderMessageRole;
  content: string;
}

export interface AIProviderRequest {
  model: string;
  messages: AIProviderMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface AIProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AIProviderResponse {
  output: string;
  requestId?: string;
  model?: string;
  usage?: AIProviderUsage;
}

export interface AIProvider {
  readonly name: string;
  execute(request: AIProviderRequest, signal?: AbortSignal): Promise<AIProviderResponse>;
}

export interface AIProviderErrorOptions {
  provider: string;
  status?: number;
  requestId?: string;
  retryable?: boolean;
  message: string;
  cause?: unknown;
}

export class AIProviderError extends Error {
  readonly provider: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly retryable: boolean;

  constructor(options: AIProviderErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "AIProviderError";
    this.provider = options.provider;
    this.status = options.status;
    this.requestId = options.requestId;
    this.retryable = options.retryable ?? false;
  }
}
