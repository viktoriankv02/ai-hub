import type { Signer } from "ethers";
import { createCompletionAttestation, type CompletionAttestation } from "./completion-attestation.js";
import type { CompletionAttestationSink } from "./completion-bridge.js";
import type { CompletionPublicationStore } from "./completion-store.js";
import type { AIJobRecord } from "./types.js";
import { OnchainJobProvisioner } from "./onchain-job-provisioner.js";
import { OnchainRewardSettler } from "./onchain-reward-settler.js";

export interface OnchainCompletionCoordinatorOptions {
  provisioner: OnchainJobProvisioner;
  attestor?: Signer;
  attestationSigner?: Signer;
  sink: CompletionAttestationSink;
  publicationStore?: CompletionPublicationStore;
  rewardSettler?: OnchainRewardSettler;
  autoSettleReward?: boolean;
}

export interface OnchainCompletionCoordinatorResult {
  attestationSigner: string;
  transactionId: string;
  offchainJobId: string;
  onchainJobId: bigint;
  rewardTransactionId?: string;
  reused?: boolean;
}

export class OnchainCompletionCoordinator {
  constructor(private readonly options: OnchainCompletionCoordinatorOptions) {}

  async provision(job: AIJobRecord) {
    return this.options.provisioner.provision(job);
  }

  async attestAndSubmit(job: AIJobRecord): Promise<OnchainCompletionCoordinatorResult> {
    if (job.status !== "completed") {
      throw new Error("only completed jobs can be submitted on-chain");
    }
    if (!job.resultHash?.trim()) {
      throw new Error("completed job must have a resultHash");
    }
    if (!job.completedAt) {
      throw new Error("completed job must have completedAt");
    }

    const attestor = this.options.attestationSigner ?? this.options.attestor;
    if (!attestor) throw new Error("attestationSigner is required");

    const provisioning = await this.options.provisioner.provision(job);
    let attestation: CompletionAttestation;
    const stored = this.options.publicationStore?.get(job.id);

    if (stored?.attestation) {
      attestation = stored.attestation;
    } else {
      attestation = await createCompletionAttestation(job, attestor);
    }

    const transactionId = stored?.transactionId ?? await this.options.sink.submit(attestation);
    if (!transactionId.trim()) throw new Error("completion sink returned an empty transaction id");

    this.options.publicationStore?.set({
      jobId: job.id,
      transactionId,
      publishedAt: stored?.publishedAt ?? new Date().toISOString(),
      attestation,
    });

    let rewardTransactionId: string | undefined;
    if (this.options.autoSettleReward) {
      if (!this.options.rewardSettler) throw new Error("rewardSettler is required when autoSettleReward is enabled");
      rewardTransactionId = await this.options.rewardSettler.settle(provisioning.onchainJobId);
    }

    return {
      attestationSigner: attestation.signer,
      transactionId,
      offchainJobId: job.id,
      onchainJobId: provisioning.onchainJobId,
      rewardTransactionId,
      reused: Boolean(stored),
    };
  }

  async provisionAndSubmit(job: AIJobRecord): Promise<OnchainCompletionCoordinatorResult> {
    return this.attestAndSubmit(job);
  }
}
