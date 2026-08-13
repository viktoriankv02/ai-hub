import { resolve } from "node:path";
import type {
  AttestationSigner,
  CompletionAttestation,
  CompletionAttestationPayload,
} from "./completion-attestation.js";
import {
  assertValidCompletionAttestation,
  createCompletionAttestation,
} from "./completion-attestation.js";
import { JsonCompletionPublicationStore, type CompletionPublicationStore } from "./completion-store.js";
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

export interface AIJobCompletionBridgeOptions {
  publicationStore?: CompletionPublicationStore;
}

export class AIJobCompletionBridge {
  private readonly published = new Map<string, CompletionBridgeResult>();
  private readonly inFlight = new Map<string, Promise<CompletionBridgeResult>>();
  private readonly publicationStore?: CompletionPublicationStore;

  constructor(
    private readonly sink: CompletionAttestationSink,
    options: AIJobCompletionBridgeOptions = {},
  ) {
    const storePath = process.env.AI_JOB_COMPLETION_STORE?.trim();
    this.publicationStore = options.publicationStore ?? (
      storePath ? new JsonCompletionPublicationStore(resolve(storePath)) : undefined
    );
  }

  async publish(
    job: AIJobRecord,
    signer: AttestationSigner,
  ): Promise<CompletionBridgeResult> {
    const memoryResult = this.published.get(job.id);
    if (memoryResult) return { ...memoryResult, reused: true };

    const existingFlight = this.inFlight.get(job.id);
    if (existingFlight) {
      const result = await existingFlight;
      return { ...result, reused: true };
    }

    const promise = this.publishInternal(job, signer);
    this.inFlight.set(job.id, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(job.id);
    }
  }

  private async publishInternal(
    job: AIJobRecord,
    signer: AttestationSigner,
  ): Promise<CompletionBridgeResult> {
    const stored = this.publicationStore?.get(job.id);
    if (stored) {
      const attestation = stored.attestation ?? await createCompletionAttestation(job, signer);
      assertValidCompletionAttestation(attestation);
      const result: CompletionBridgeResult = {
        jobId: job.id,
        attestation,
        transactionId: stored.transactionId,
        reused: true,
      };
      this.published.set(job.id, result);
      return result;
    }

    const attestation = await createCompletionAttestation(job, signer);
    assertValidCompletionAttestation(attestation);

    const transactionId = await this.sink.submit(attestation);
    if (!transactionId.trim()) {
      throw new Error("completion sink returned an empty transaction id");
    }

    const result: CompletionBridgeResult = {
      jobId: job.id,
      attestation,
      transactionId,
      reused: false,
    };

    // Persist the exact attestation that crossed the trust boundary. This
    // makes restart/recovery deterministic and avoids re-signing with a
    // different key after a process restart.
    this.publicationStore?.set({
      jobId: job.id,
      transactionId,
      publishedAt: new Date().toISOString(),
      attestation,
    });

    this.published.set(job.id, result);
    return result;
  }

  hasPublished(jobId: string): boolean {
    return this.published.has(jobId) || this.publicationStore?.get(jobId) !== undefined;
  }

  getPublished(jobId: string): CompletionBridgeResult | undefined {
    const memoryResult = this.published.get(jobId);
    if (memoryResult) return { ...memoryResult, reused: true };

    const stored = this.publicationStore?.get(jobId);
    if (!stored || !stored.attestation) return undefined;

    return {
      jobId,
      attestation: stored.attestation,
      transactionId: stored.transactionId,
      reused: true,
    };
  }
}

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
