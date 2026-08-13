export type AIProviderRole = "system" | "user";

export interface AIProviderMessage {
  role: AIProviderRole;
  content: string;
}

export interface AIProviderRequest {
  model: string;
  messages: AIProviderMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface AIProviderResponse {
  output: string;
  requestId?: string;
  model?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface AIProvider {
  readonly name: string;
  execute(request: AIProviderRequest, signal?: AbortSignal): Promise<AIProviderResponse>;
}

export interface AIProviderRetryOptions {
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
}

export class AIProviderError extends Error {
  readonly provider: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly retryable: boolean;

  constructor(options: {
    provider: string;
    message: string;
    status?: number;
    requestId?: string;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "AIProviderError";
    this.provider = options.provider;
    this.status = options.status;
    this.requestId = options.requestId;
    this.retryable = options.retryable ?? false;
  }
}
