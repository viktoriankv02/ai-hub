import type { Signer } from "ethers";
import { createCompletionAttestation } from "./completion-attestation.js";
import type { CompletionAttestationSink } from "./completion-bridge.js";
import type { AIJobRecord } from "./types.js";
import { OnchainJobProvisioner } from "./onchain-job-provisioner.js";

export interface OnchainCompletionCoordinatorOptions {
  provisioner: OnchainJobProvisioner;
  attestor: Signer;
  sink: CompletionAttestationSink;
}

export interface OnchainCompletionCoordinatorResult {
  attestationSigner: string;
  transactionId: string;
  offchainJobId: string;
  onchainJobId: bigint;
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

    const provisioning = await this.options.provisioner.provision(job);
    const attestation = await createCompletionAttestation(job, this.options.attestor);
    const transactionId = await this.options.sink.submit(attestation);

    return {
      attestationSigner: attestation.signer,
      transactionId,
      offchainJobId: job.id,
      onchainJobId: provisioning.onchainJobId,
    };
  }

  async provisionAndSubmit(job: AIJobRecord): Promise<OnchainCompletionCoordinatorResult> {
    return this.attestAndSubmit(job);
  }
}
