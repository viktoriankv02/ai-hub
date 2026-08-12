import type { AttestationSigner } from "./completion-attestation.js";
import { AIJobCompletionBridge, type CompletionBridgeResult, type CompletionAttestationSink } from "./completion-bridge.js";
import type { AIJobRecord } from "./types.js";
import type { OnchainJobProvisioner, OnchainJobProvisioningResult } from "./onchain-job-provisioner.js";

export interface OnchainCompletionCoordinatorOptions {
  provisioner: OnchainJobProvisioner;
  sink: CompletionAttestationSink;
  attestationSigner: AttestationSigner;
}

export interface OnchainCompletionCoordinatorResult {
  jobId: string;
  provisioning: OnchainJobProvisioningResult;
  completion: CompletionBridgeResult;
}

/**
 * Coordinates the full trust-boundary transition for an AI job:
 * completed off-chain job -> funded on-chain job -> signed completion ->
 * verified activity submission.
 */
export class OnchainCompletionCoordinator {
  private readonly bridge: AIJobCompletionBridge;

  constructor(private readonly options: OnchainCompletionCoordinatorOptions) {
    this.bridge = new AIJobCompletionBridge(options.sink);
  }

  async provision(job: AIJobRecord): Promise<OnchainJobProvisioningResult> {
    if (job.status !== "completed") {
      throw new Error("only completed jobs can be provisioned on-chain");
    }
    return this.options.provisioner.provision(job);
  }

  async attestAndSubmit(job: AIJobRecord): Promise<OnchainCompletionCoordinatorResult> {
    if (job.status !== "completed") {
      throw new Error("only completed jobs can be submitted on-chain");
    }

    const provisioning = await this.options.provisioner.provision(job);
    const completion = await this.bridge.publish(job, this.options.attestationSigner);

    return {
      jobId: job.id,
      provisioning,
      completion,
    };
  }

  hasSubmitted(jobId: string): boolean {
    return this.bridge.hasPublished(jobId);
  }
}
