import type { AttestationSigner } from "./completion-attestation.js";
import { AIJobCompletionBridge, type CompletionBridgeResult, type CompletionAttestationSink } from "./completion-bridge.js";
import type { AIJobRecord } from "./types.js";
import type { OnchainJobProvisioner, OnchainJobProvisioningResult } from "./onchain-job-provisioner.js";
import type { OnchainRewardSettler, OnchainRewardSettlement } from "./onchain-reward-settler.js";

export interface OnchainCompletionCoordinatorOptions {
  provisioner: OnchainJobProvisioner;
  sink: CompletionAttestationSink;
  attestationSigner: AttestationSigner;
  rewardSettler?: OnchainRewardSettler;
  autoSettleReward?: boolean;
}
export interface OnchainCompletionCoordinatorResult {
  jobId: string;
  provisioning: OnchainJobProvisioningResult;
  completion: CompletionBridgeResult;
  rewardSettlement?: OnchainRewardSettlement;
}

export class OnchainCompletionCoordinator {
  private readonly bridge: AIJobCompletionBridge;
  constructor(private readonly options: OnchainCompletionCoordinatorOptions) { this.bridge = new AIJobCompletionBridge(options.sink); }

  async provision(job: AIJobRecord): Promise<OnchainJobProvisioningResult> {
    if (job.status !== "completed") throw new Error("only completed jobs can be provisioned on-chain");
    return this.options.provisioner.provision(job);
  }

  async attestAndSubmit(job: AIJobRecord): Promise<OnchainCompletionCoordinatorResult> {
    if (job.status !== "completed") throw new Error("only completed jobs can be submitted on-chain");
    const provisioning = await this.options.provisioner.provision(job);
    const completion = await this.bridge.publish(job, this.options.attestationSigner);
    let rewardSettlement: OnchainRewardSettlement | undefined;
    if (this.options.autoSettleReward && this.options.rewardSettler) {
      rewardSettlement = await this.options.rewardSettler.settle(provisioning.onchainJobId);
    }
    return { jobId: job.id, provisioning, completion, rewardSettlement };
  }

  hasSubmitted(jobId: string): boolean { return this.bridge.hasPublished(jobId); }
}
