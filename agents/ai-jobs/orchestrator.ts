import { InMemoryAIJobStore } from "./store.js";
import type {
  AIJobExecutionResult,
  AIJobExecutor,
  AIJobOrchestratorOptions,
  AIJobRecord,
  AIJobRequest,
  AIJobRunResult,
  AIJobStore,
} from "./types.js";

function defaultId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function clone(job: AIJobRecord): AIJobRecord {
  return {
    ...job,
    metadata: job.metadata ? { ...job.metadata } : undefined,
  };
}

/**
 * Off-chain control plane for AI jobs.
 *
 * The orchestrator deliberately does not know about ethers or a particular
 * blockchain. Its responsibility is lifecycle, idempotency, retry policy and
 * execution coalescing. A later adapter can translate a completed record into
 * AIAgentEngine.completeJob()/AIJobActivityAdapter.reportCompletedJob().
 */
export class AIJobOrchestrator {
  private readonly maxAttempts: number;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly running = new Set<string>();

  constructor(
    private readonly store: AIJobStore = new InMemoryAIJobStore(),
    options: AIJobOrchestratorOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? defaultId;

    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new Error("maxAttempts must be a positive integer");
    }
  }

  enqueue(request: AIJobRequest): AIJobRecord {
    const existing = this.store.getByIdempotencyKey(request.idempotencyKey);
    if (existing) return clone(existing);

    if (!request.idempotencyKey.trim()) throw new Error("idempotencyKey is required");
    if (!request.agentId.trim()) throw new Error("agentId is required");
    if (!request.taskHash.trim()) throw new Error("taskHash is required");
    if (!request.prompt.trim()) throw new Error("prompt is required");

    const timestamp = this.now().toISOString();
    const job: AIJobRecord = {
      ...request,
      trigger: request.trigger ?? "manual",
      id: this.idFactory(),
      status: "queued",
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: request.metadata ? { ...request.metadata } : undefined,
    };

    this.store.save(job);
    return clone(job);
  }

  get(id: string): AIJobRecord | undefined {
    const job = this.store.get(id);
    return job ? clone(job) : undefined;
  }

  list(): AIJobRecord[] {
    return this.store.list().map(clone);
  }

  async run(id: string, executor: AIJobExecutor): Promise<AIJobRunResult> {
    const job = this.store.get(id);
    if (!job) throw new Error(`AI job ${id} not found`);

    if (job.status === "completed" || job.status === "cancelled") {
      return { job: clone(job), reused: true };
    }

    if (this.running.has(id)) {
      return { job: clone(job), reused: true };
    }

    if (job.attempts >= this.maxAttempts) {
      return { job: clone(job), reused: true };
    }

    this.running.add(id);
    try {
      const started = this.transition(job, "running", {
        attempts: job.attempts + 1,
        startedAt: this.now().toISOString(),
        error: undefined,
      });

      try {
        const result = await executor.execute(clone(started));
        const completed = this.transition(started, "completed", {
          completedAt: this.now().toISOString(),
          resultHash: result.resultHash,
          error: undefined,
        });
        return { job: clone(completed), reused: false };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const terminal = started.attempts >= this.maxAttempts;
        const failed = this.transition(started, terminal ? "failed" : "queued", {
          error: message,
        });
        return { job: clone(failed), reused: false };
      }
    } finally {
      this.running.delete(id);
    }
  }

  cancel(id: string): AIJobRecord {
    const job = this.store.get(id);
    if (!job) throw new Error(`AI job ${id} not found`);
    if (job.status === "completed") throw new Error("completed jobs cannot be cancelled");
    if (job.status === "cancelled") return clone(job);

    return clone(this.transition(job, "cancelled", {}));
  }

  retry(id: string): AIJobRecord {
    const job = this.store.get(id);
    if (!job) throw new Error(`AI job ${id} not found`);
    if (job.status !== "failed") throw new Error("only failed jobs can be retried");
    if (job.attempts >= this.maxAttempts) throw new Error("maximum attempts reached");

    return clone(this.transition(job, "queued", { trigger: "retry", error: undefined }));
  }

  private transition(
    job: AIJobRecord,
    status: AIJobRecord["status"],
    patch: Partial<AIJobRecord>,
  ): AIJobRecord {
    const next: AIJobRecord = {
      ...job,
      ...patch,
      status,
      updatedAt: this.now().toISOString(),
    };
    this.store.save(next);
    return next;
  }
}

export function successfulExecution(resultHash: string, output?: string): AIJobExecutionResult {
  if (!resultHash.trim()) throw new Error("resultHash is required");
  return { resultHash, output };
}
