import { createHash } from "node:crypto";
import type { AIJobExecutor, AIJobExecutionResult, AIJobRecord } from "./types.js";

export type { AIJobExecutor } from "./types.js";

export interface AIJobExecutionContext {
  executePrompt(job: AIJobRecord): Promise<string>;
}

/**
 * Adapter between the queue and a real AI provider.
 * The provider returns plain output; AI Hub canonicalizes it into a SHA-256
 * result hash before the result can cross the on-chain trust boundary.
 */
export class AIProviderJobExecutor implements AIJobExecutor {
  constructor(private readonly provider: AIJobExecutionContext) {}

  async execute(job: AIJobRecord): Promise<AIJobExecutionResult> {
    const output = await this.provider.executePrompt(job);
    if (typeof output !== "string" || !output.trim()) {
      throw new Error("AI provider returned an empty result");
    }

    const resultHash = createHash("sha256")
      .update(output, "utf8")
      .digest("hex");

    return { resultHash: `sha256:${resultHash}`, output };
  }
}

/** Safe local executor for development and deterministic integration tests. */
export class DryRunAIExecutor implements AIJobExecutor {
  async execute(job: AIJobRecord): Promise<AIJobExecutionResult> {
    const canonical = [job.agentId, job.taskHash, job.prompt].join("\n");
    const resultHash = createHash("sha256").update(canonical, "utf8").digest("hex");
    return {
      resultHash: `dry-run:${resultHash}`,
      output: `Dry-run completed for ${job.id}`,
    };
  }
}
