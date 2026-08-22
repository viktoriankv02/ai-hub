import { resolve } from "node:path";
import { CompletionAttestationPolicy, type CompletionPolicyOptions } from "./completion-policy.js";
import { assertValidCompletionAttestation, createCompletionAttestation, type AttestationSigner } from "./completion-attestation.js";
import type { CompletionAttestationSink } from "./completion-bridge.js";
import type { CompletionPublicationStore } from "./completion-store.js";
import { JsonCompletionPublicationStore } from "./completion-store.js";
import type { AIJobRecord } from "./types.js";
import type { OnchainJobProvisioner, OnchainJobProvisioningResult } from "./onchain-job-provisioner.js";
import type { OnchainRewardSettler, OnchainRewardSettlement } from "./onchain-reward-settler.js";

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
  attestation: Awaited<ReturnType<typeof createCompletionAttestation>>;
  transactionId: string;
  reused: boolean;
  rewardSettlement?: OnchainRewardSettlement;
}

/**
 * Production-safe facade for the off-chain -> attestation -> on-chain flow.
 *
 * The critical ordering is:
 * 1. provision the on-chain job binding;
 * 2. create the signed completion locally;
 * 3. validate freshness, signer and job/result binding;
 * 4. submit the transaction;
 * 5. persist publication state only after the sink reports success.
 *
 * This deliberately does not use AIJobCompletionBridge because that class
 * submits immediately after signing. This facade needs the policy gate before
 * spending gas.
 */
export class SecureOnchainCompletionCoordinator {
  private readonly store?: CompletionPublicationStore;
  private readonly policy: CompletionAttestationPolicy;

  constructor(private readonly options: SecureOnchainCompletionOptions) {
    const storePath = options.completionStorePath ?? process.env.AI_JOB_COMPLETION_STORE?.trim();
    this.store = options.completionStore ?? (
      storePath ? new JsonCompletionPublicationStore(resolve(storePath)) : undefined
    );
    this.policy = new CompletionAttestationPolicy(options.completionPolicy);
  }

  async submit(job: AIJobRecord): Promise<SecureOnchainCompletionResult> {
    if (job.status !== "completed") {
      throw new Error("only completed jobs can be submitted on-chain");
    }

    const provisioning = await this.options.provisioner.provision(job);
    const existing = this.store?.get(job.id);
    if (existing?.attestation) {
      assertValidCompletionAttestation(existing.attestation);
      return {
        jobId: job.id,
        provisioning,
        attestation: existing.attestation,
        transactionId: existing.transactionId,
        reused: true,
      };
    }

    const attestation = await createCompletionAttestation(job, this.options.attestationSigner);
    this.policy.validate(job, attestation);

    const transactionId = await this.options.sink.submit(attestation);
    if (!transactionId.trim()) {
      throw new Error("completion sink returned an empty transaction id");
    }

    this.store?.set({
      jobId: job.id,
      transactionId,
      publishedAt: new Date().toISOString(),
      attestation,
    });

    let rewardSettlement: OnchainRewardSettlement | undefined;
    if (this.options.autoSettleReward && this.options.rewardSettler) {
      rewardSettlement = await this.options.rewardSettler.settle(provisioning.onchainJobId);
    }

    return {
      jobId: job.id,
      provisioning,
      attestation,
      transactionId,
      reused: false,
      rewardSettlement,
    };
  }

  hasSubmitted(jobId: string): boolean {
    return this.store?.get(jobId) !== undefined;
  }

  getSubmitted(jobId: string) {
    return this.store?.get(jobId);
  }
}
