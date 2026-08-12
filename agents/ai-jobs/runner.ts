import type { AIJobExecutor, AIJobRecord } from "./types.js";
import { AIJobOrchestrator } from "./orchestrator.js";

export interface AIJobRunnerOptions {
  batchSize?: number;
}

export interface AIJobDrainResult {
  processed: AIJobRecord[];
  skipped: AIJobRecord[];
}

/**
 * Pulls queued jobs from the orchestrator and executes a bounded batch.
 * A future HTTP worker can call drain() on a timer or explicit wakeup.
 */
export class AIJobRunner {
  private readonly batchSize: number;

  constructor(
    private readonly orchestrator: AIJobOrchestrator,
    private readonly executor: AIJobExecutor,
    options: AIJobRunnerOptions = {},
  ) {
    this.batchSize = options.batchSize ?? 5;
    if (!Number.isInteger(this.batchSize) || this.batchSize < 1) {
      throw new Error("batchSize must be a positive integer");
    }
  }

  async drain(): Promise<AIJobDrainResult> {
    const queued = this.orchestrator
      .list()
      .filter((job) => job.status === "queued")
      .slice(0, this.batchSize);

    const processed: AIJobRecord[] = [];
    const skipped: AIJobRecord[] = [];

    for (const job of queued) {
      const result = await this.orchestrator.run(job.id, this.executor);
      if (result.reused) skipped.push(result.job);
      else processed.push(result.job);
    }

    return { processed, skipped };
  }
}
