import type { AIJobRecord } from "./types.js";
import type { OnchainCompletionCoordinator } from "./onchain-completion-coordinator.js";
import type { OnchainJobProvisioningResult } from "./onchain-job-provisioner.js";
import type { OnchainRewardSettlement } from "./onchain-reward-settler.js";
import type { AIJobChainExecutionAdapter, AIJobChainTarget, ChainExecutionResult } from "./chain-execution.js";

export interface EVMChainExecutionAdapterOptions {
  target: AIJobChainTarget;
  coordinator: OnchainCompletionCoordinator;
  resolveOnchainJobId?: (jobId: string) => Promise<bigint>;
  canExecute?: (job: AIJobRecord) => Promise<boolean> | boolean;
}

function fromProvisioning(
  target: AIJobChainTarget,
  job: AIJobRecord,
  provisioning: OnchainJobProvisioningResult,
): ChainExecutionResult {
  return {
    target,
    jobId: job.id,
    onchainJobId: provisioning.onchainJobId.toString(),
    provisionTransactionId: provisioning.transactionId === "reused" ? undefined : provisioning.transactionId,
    status: "provisioned",
    reused: provisioning.reused,
  };
}

function fromCompletion(
  target: AIJobChainTarget,
  job: AIJobRecord,
  result: {
    provisioning: OnchainJobProvisioningResult;
    completion: { transactionId: string; reused: boolean };
    rewardSettlement?: OnchainRewardSettlement;
  },
): ChainExecutionResult {
  const settled = Boolean(result.rewardSettlement);
  return {
    target,
    jobId: job.id,
    onchainJobId: result.provisioning.onchainJobId.toString(),
    provisionTransactionId: result.provisioning.transactionId === "reused" ? undefined : result.provisioning.transactionId,
    completionTransactionId: result.completion.transactionId,
    rewardTransactionId: result.rewardSettlement?.transactionId,
    status: settled ? "settled" : "completed",
    reused: result.provisioning.reused && result.completion.reused,
  };
}

export class EVMChainExecutionAdapter implements AIJobChainExecutionAdapter {
  readonly target: AIJobChainTarget;

  constructor(private readonly options: EVMChainExecutionAdapterOptions) {
    if (options.target.family !== "evm") throw new Error("EVM adapter requires an EVM target");
    if (!options.target.enabled) throw new Error(`chain target '${options.target.id}' is disabled`);
    this.target = { ...options.target };
  }

  async canExecute(job: AIJobRecord): Promise<boolean> {
    if (job.status !== "completed") return false;
    if (!this.target.enabled) return false;
    return this.options.canExecute ? this.options.canExecute(job) : true;
  }

  async provision(job: AIJobRecord): Promise<ChainExecutionResult> {
    if (!(await this.canExecute(job))) {
      throw new Error(`job '${job.id}' is not executable on ${this.target.name}`);
    }
    const provisioning = await this.options.coordinator.provision(job);
    return fromProvisioning(this.target, job, provisioning);
  }

  async complete(job: AIJobRecord): Promise<ChainExecutionResult> {
    if (!(await this.canExecute(job))) {
      throw new Error(`job '${job.id}' is not executable on ${this.target.name}`);
    }
    return fromCompletion(this.target, job, await this.options.coordinator.attestAndSubmit(job));
  }

  async execute(job: AIJobRecord): Promise<ChainExecutionResult> {
    return this.complete(job);
  }
}
