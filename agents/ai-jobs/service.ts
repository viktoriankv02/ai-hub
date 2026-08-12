import { AIJobOrchestrator } from "./orchestrator.js";
import type { AIJobExecutor, AIJobRecord, AIJobRequest } from "./types.js";
import { AIJobRunner } from "./runner.js";
import type { OnchainCompletionCoordinator } from "./onchain-completion-coordinator.js";
import type { OnchainJobProvisioningResult } from "./onchain-job-provisioner.js";
import type { OnchainCompletionCoordinatorResult } from "./onchain-completion-coordinator.js";

export interface AIJobServiceOptions {
  batchSize?: number;
  onchainCompletionCoordinator?: OnchainCompletionCoordinator;
}

export class AIJobService {
  private readonly runner: AIJobRunner;
  private readonly onchainCompletionCoordinator?: OnchainCompletionCoordinator;

  constructor(
    private readonly orchestrator: AIJobOrchestrator,
    private readonly executor: AIJobExecutor,
    options: AIJobServiceOptions = {},
  ) {
    this.runner = new AIJobRunner(orchestrator, executor, options);
    this.onchainCompletionCoordinator = options.onchainCompletionCoordinator;
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

  async provisionOnchain(id: string): Promise<OnchainJobProvisioningResult> {
    if (!this.onchainCompletionCoordinator) {
      throw new Error("onchain completion coordinator is not configured");
    }
    const job = this.orchestrator.get(id);
    if (!job) throw new Error(`AI job ${id} not found`);
    return this.onchainCompletionCoordinator.provision(job);
  }

  async submitCompletionOnchain(id: string): Promise<OnchainCompletionCoordinatorResult> {
    if (!this.onchainCompletionCoordinator) {
      throw new Error("onchain completion coordinator is not configured");
    }
    const job = this.orchestrator.get(id);
    if (!job) throw new Error(`AI job ${id} not found`);
    return this.onchainCompletionCoordinator.attestAndSubmit(job);
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
