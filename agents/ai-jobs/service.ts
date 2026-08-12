import { AIJobOrchestrator } from "./orchestrator.js";
import type { AIJobExecutor, AIJobRecord, AIJobRequest } from "./types.js";
import { AIJobRunner } from "./runner.js";

export interface AIJobServiceOptions {
  batchSize?: number;
}

export class AIJobService {
  private readonly runner: AIJobRunner;

  constructor(
    private readonly orchestrator: AIJobOrchestrator,
    private readonly executor: AIJobExecutor,
    options: AIJobServiceOptions = {},
  ) {
    this.runner = new AIJobRunner(orchestrator, executor, options);
  }

  enqueue(request: AIJobRequest): AIJobRecord {
    return this.orchestrator.enqueue(request);
  }

  get(id: string): AIJobRecord | undefined {
    return this.orchestrator.get(id);
  }

  list(): AIJobRecord[] {
    return this.orchestrator.list();
  }

  async run(id: string): Promise<AIJobRecord> {
    const result = await this.orchestrator.run(id, this.executor);
    return result.job;
  }

  cancel(id: string): AIJobRecord {
    return this.orchestrator.cancel(id);
  }

  retry(id: string): AIJobRecord {
    return this.orchestrator.retry(id);
  }

  async drain() {
    return this.runner.drain();
  }
}
