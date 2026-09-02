import type { AIJobRecord } from "./types.js";
import type { ChainExecutionResult } from "./chain-execution.js";
import type { AIJobMultiChainExecutor } from "./multi-chain-runtime.js";

/**
 * Thin multi-chain facade kept separate from AIJobService so the existing
 * single-chain API remains backwards compatible.
 */
export class AIJobMultiChainService {
  constructor(private readonly executor: AIJobMultiChainExecutor) {}

  targets() {
    return this.executor.targets();
  }

  async provision(job: AIJobRecord, targetId?: string): Promise<ChainExecutionResult> {
    this.requireCompleted(job);
    return this.executor.provision(job, this.resolveTarget(job, targetId));
  }

  async complete(job: AIJobRecord, targetId?: string): Promise<ChainExecutionResult> {
    this.requireCompleted(job);
    return this.executor.complete(job, this.resolveTarget(job, targetId));
  }

  async execute(job: AIJobRecord, targetId?: string): Promise<ChainExecutionResult> {
    this.requireCompleted(job);
    return this.executor.execute(job, this.resolveTarget(job, targetId));
  }

  private resolveTarget(job: AIJobRecord, targetId?: string): string | undefined {
    return targetId?.trim() || job.chainTargetId?.trim() || undefined;
  }

  private requireCompleted(job: AIJobRecord): void {
    if (job.status !== "completed") {
      throw new Error("only completed jobs can execute on-chain");
    }
  }
}
