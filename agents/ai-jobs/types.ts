export type AIJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type AIJobTrigger = "manual" | "opportunity" | "schedule" | "retry";

export interface AIJobRequest {
  idempotencyKey: string;
  agentId: string;
  taskHash: string;
  prompt: string;
  reward: string;
  trigger?: AIJobTrigger;
  opportunityId?: string;
  chainTargetId?: string;
  metadata?: Record<string, string>;
}

export interface AIJobRecord extends AIJobRequest {
  id: string;
  status: AIJobStatus;
  attempts: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  resultHash?: string;
  error?: string;
}

export interface AIJobExecutionResult {
  resultHash: string;
  output?: string;
}

export interface AIJobExecutor {
  execute(job: AIJobRecord): Promise<AIJobExecutionResult>;
}

export interface AIJobStore {
  get(id: string): AIJobRecord | undefined;
  getByIdempotencyKey(key: string): AIJobRecord | undefined;
  save(job: AIJobRecord): void;
  list(): AIJobRecord[];
}

export interface AIJobOrchestratorOptions {
  maxAttempts?: number;
  now?: () => Date;
  idFactory?: () => string;
}

export interface AIJobRunResult {
  job: AIJobRecord;
  reused: boolean;
}
