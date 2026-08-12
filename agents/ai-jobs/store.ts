import type { AIJobRecord, AIJobStore } from "./types.js";

export class InMemoryAIJobStore implements AIJobStore {
  private readonly jobs = new Map<string, AIJobRecord>();
  private readonly idempotency = new Map<string, string>();

  get(id: string): AIJobRecord | undefined {
    const job = this.jobs.get(id);
    return job ? { ...job, metadata: job.metadata ? { ...job.metadata } : undefined } : undefined;
  }

  getByIdempotencyKey(key: string): AIJobRecord | undefined {
    const id = this.idempotency.get(key);
    return id ? this.get(id) : undefined;
  }

  save(job: AIJobRecord): void {
    const copy: AIJobRecord = {
      ...job,
      metadata: job.metadata ? { ...job.metadata } : undefined,
    };
    this.jobs.set(job.id, copy);
    this.idempotency.set(job.idempotencyKey, job.id);
  }

  list(): AIJobRecord[] {
    return [...this.jobs.values()].map((job) => ({
      ...job,
      metadata: job.metadata ? { ...job.metadata } : undefined,
    }));
  }
}
