import type { AIJobRecord } from "./types.js";
import {
  createCompletionAttestation,
  payloadFromJob,
  type AttestationSigner,
  type CompletionAttestation,
} from "./completion-attestation.js";
import type {
  CompletionPublicationRecord,
  CompletionPublicationStore,
} from "./completion-store.js";

export interface CompletionPublisher {
  publish(job: AIJobRecord, attestation: CompletionAttestation): Promise<string>;
}

export interface CompletionPublicationResult {
  jobId: string;
  transactionId: string;
  publishedAt: string;
  attestation: CompletionAttestation;
}

export interface CompletionPublicationPipelineOptions {
  now?: () => Date;
}

/**
 * Converts a completed local AI job into a signed, durable completion
 * publication. The actual blockchain transport is injected so this module
 * stays usable with a mock, RPC adapter, relayer or future queue worker.
 */
export class CompletionPublicationPipeline {
  private readonly now: () => Date;

  constructor(
    private readonly store: CompletionPublicationStore,
    private readonly publisher: CompletionPublisher,
    options: CompletionPublicationPipelineOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async publishCompletedJob(
    job: AIJobRecord,
    signer: AttestationSigner,
  ): Promise<CompletionPublicationResult> {
    const existing = this.store.get(job.id);
    if (existing?.attestation) {
      return {
        jobId: existing.jobId,
        transactionId: existing.transactionId,
        publishedAt: existing.publishedAt,
        attestation: existing.attestation,
      };
    }

    const payload = payloadFromJob(job);
    const attestation = await createCompletionAttestation(job, signer);

    if (
      payload.jobId !== attestation.jobId ||
      payload.agentId !== attestation.agentId ||
      payload.taskHash !== attestation.taskHash ||
      payload.resultHash !== attestation.resultHash ||
      payload.completedAt !== attestation.completedAt
    ) {
      throw new Error(`completion attestation payload mismatch for job ${job.id}`);
    }

    const transactionId = await this.publisher.publish(job, attestation);
    if (!transactionId.trim()) {
      throw new Error(`completion publisher returned an empty transaction id for job ${job.id}`);
    }

    const record: CompletionPublicationRecord = {
      jobId: job.id,
      transactionId,
      publishedAt: this.now().toISOString(),
      attestation,
    };

    this.store.set(record);

    return {
      jobId: record.jobId,
      transactionId: record.transactionId,
      publishedAt: record.publishedAt,
      attestation,
    };
  }
}

export class MemoryCompletionPublisher implements CompletionPublisher {
  private readonly transactions = new Map<string, string>();
  private sequence = 0;

  async publish(job: AIJobRecord): Promise<string> {
    const existing = this.transactions.get(job.id);
    if (existing) return existing;

    this.sequence += 1;
    const tx = `0x${this.sequence.toString(16).padStart(64, "0")}`;
    this.transactions.set(job.id, tx);
    return tx;
  }
}
