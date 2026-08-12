import type {
  AttestationSigner,
  CompletionAttestation,
  CompletionAttestationPayload,
} from "./completion-attestation.js";
import {
  assertValidCompletionAttestation,
  createCompletionAttestation,
} from "./completion-attestation.js";
import type { AIJobRecord } from "./types.js";

export interface CompletionAttestationSink {
  submit(attestation: CompletionAttestation): Promise<string>;
}

export interface CompletionBridgeResult {
  jobId: string;
  attestation: CompletionAttestation;
  transactionId: string;
  reused: boolean;
}

/**
 * Trust-boundary adapter between the off-chain AI runtime and an eventual
 * on-chain completion reporter. It owns neither HTTP nor ethers contracts;
 * those concerns are supplied by CompletionAttestationSink.
 */
export class AIJobCompletionBridge {
  private readonly published = new Map<string, CompletionBridgeResult>();

  constructor(private readonly sink: CompletionAttestationSink) {}

  async publish(
    job: AIJobRecord,
    signer: AttestationSigner,
  ): Promise<CompletionBridgeResult> {
    const existing = this.published.get(job.id);
    if (existing) return { ...existing, reused: true };

    const attestation = await createCompletionAttestation(job, signer);
    assertValidCompletionAttestation(attestation);

    const transactionId = await this.sink.submit(attestation);
    if (!transactionId.trim()) throw new Error("completion sink returned an empty transaction id");

    const result = {
      jobId: job.id,
      attestation,
      transactionId,
      reused: false,
    };
    this.published.set(job.id, result);
    return result;
  }

  hasPublished(jobId: string): boolean {
    return this.published.has(jobId);
  }

  getPublished(jobId: string): CompletionBridgeResult | undefined {
    const result = this.published.get(jobId);
    return result ? { ...result, reused: true } : undefined;
  }
}

/** Deterministic sink useful for local tests and development. */
export class MemoryCompletionSink implements CompletionAttestationSink {
  readonly submissions: CompletionAttestation[] = [];

  async submit(attestation: CompletionAttestation): Promise<string> {
    this.submissions.push(attestation);
    return `memory:${attestation.jobId}:${this.submissions.length}`;
  }
}

export function attestationPayload(attestation: CompletionAttestation): CompletionAttestationPayload {
  return {
    version: attestation.version,
    jobId: attestation.jobId,
    agentId: attestation.agentId,
    taskHash: attestation.taskHash,
    resultHash: attestation.resultHash,
    completedAt: attestation.completedAt,
  };
}
