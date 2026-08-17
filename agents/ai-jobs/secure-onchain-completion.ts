import { CompletionAttestationPolicy, type CompletionPolicyOptions } from "./completion-policy.js";
import type { AttestationSigner } from "./completion-attestation.js";
import { AIJobCompletionBridge, type CompletionAttestationSink, type CompletionBridgeResult } from "./completion-bridge.js";
import type { AIJobRecord } from "./types.js";
import type { OnchainJobProvisioner, OnchainJobProvisioningResult } from "./onchain-job-provisioner.js";
import type { OnchainRewardSettler, OnchainRewardSettlement } from "./onchain-reward-settler.js";
import { JsonCompletionPublicationStore, type CompletionPublicationStore } from "./completion-store.js";

export interface SecureOnchainCompletionOptions {
  provisioner: OnchainJobProvisioner;
  sink: CompletionAttestationSink;
  attestationSigner: AttestationSigner;
  completionPolicy?: CompletionPolicyOptions;
  rewardSettler?: OnchainRewardSettler;
  autoSettleReward?: boolean;
  completionStore?: CompletionPublicationStore;
  completionStorePath?: string;
}

export interface SecureOnchainCompletionResult {
  jobId: string;
  provisioning: OnchainJobProvisioningResult;
  completion: CompletionBridgeResult;
  rewardSettlement?: OnchainRewardSettlement;
}

/**
 * Safer facade for the complete off-chain -> attestation -> on-chain flow.
 *
 * The policy is checked after the signed attestation is produced but before a
 * reward settlement is attempted. The bridge remains responsible for durable
 * publication/idempotency, while the provisioner owns the off-chain/on-chain
 * job binding.
 */
export class SecureOnchainCompletionCoordinator {
  private readonly bridge: AIJobCompletionBridge;
  private readonly policy: CompletionAttestationPolicy;

  constructor(private readonly options: SecureOnchainCompletionOptions) {
    const store = options.completionStore ?? (
      options.completionStorePath
        ? new JsonCompletionPublicationStore(options.completionStorePath)
        : undefined
    );
    this.bridge = new AIJobCompletionBridge(options.sink, { publicationStore: store });
    this.policy = new CompletionAttestationPolicy(options.completionPolicy);
  }

  async submit(job: AIJobRecord): Promise<SecureOnchainCompletionResult> {
    if (job.status !== "completed") {
      throw new Error("only completed jobs can be submitted on-chain");
    }

    const provisioning = await this.options.provisioner.provision(job);
    const completion = await this.bridge.publish(job, this.options.attestationSigner);
    this.policy.validate(job, completion.attestation);

    let rewardSettlement: OnchainRewardSettlement | undefined;
    if (this.options.autoSettleReward && this.options.rewardSettler) {
      rewardSettlement = await this.options.rewardSettler.settle(provisioning.onchainJobId);
    }

    return {
      jobId: job.id,
      provisioning,
      completion,
      rewardSettlement,
    };
  }

  hasSubmitted(jobId: string): boolean {
    return this.bridge.hasPublished(jobId);
  }

  getSubmitted(jobId: string): CompletionBridgeResult | undefined {
    return this.bridge.getPublished(jobId);
  }
}
