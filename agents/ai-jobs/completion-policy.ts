import { isHexString } from "ethers";
import type { CompletionAttestation } from "./completion-attestation.js";
import { assertValidCompletionAttestation } from "./completion-attestation.js";
import type { AIJobRecord } from "./types.js";

export interface CompletionPolicyOptions {
  /** Maximum age of a completion attestation. 0 disables the age limit. */
  maxAgeMs?: number;
  /** Allowed clock skew for timestamps slightly ahead of the worker clock. */
  clockSkewMs?: number;
  /** Optional allow-list for attestation signer addresses. */
  allowedSigners?: string[];
  now?: () => Date;
}

export interface CompletionPolicyResult {
  valid: true;
  ageMs: number;
}

/**
 * Local policy layer used before a completion is sent on-chain.
 *
 * Signature validity alone is not enough: a stale completion, a malformed
 * result hash or an unexpected signer should be rejected before spending gas.
 * The contract remains the final authority and independently validates the
 * signed payload and configured attester allow-list.
 */
export class CompletionAttestationPolicy {
  private readonly maxAgeMs: number;
  private readonly clockSkewMs: number;
  private readonly allowedSigners?: Set<string>;
  private readonly now: () => Date;

  constructor(options: CompletionPolicyOptions = {}) {
    this.maxAgeMs = options.maxAgeMs ?? 0;
    this.clockSkewMs = options.clockSkewMs ?? 30_000;
    this.now = options.now ?? (() => new Date());

    if (!Number.isFinite(this.maxAgeMs) || this.maxAgeMs < 0) {
      throw new Error("maxAgeMs must be a non-negative finite number");
    }
    if (!Number.isFinite(this.clockSkewMs) || this.clockSkewMs < 0) {
      throw new Error("clockSkewMs must be a non-negative finite number");
    }

    if (options.allowedSigners) {
      this.allowedSigners = new Set(options.allowedSigners.map((value) => value.toLowerCase()));
    }
  }

  validate(job: AIJobRecord, attestation: CompletionAttestation): CompletionPolicyResult {
    if (job.status !== "completed") {
      throw new Error("completion policy requires a completed job");
    }

    assertValidCompletionAttestation(attestation);

    if (attestation.jobId !== job.id) {
      throw new Error("completion attestation jobId does not match the job");
    }
    if (attestation.agentId !== job.agentId) {
      throw new Error("completion attestation agentId does not match the job");
    }
    if (!isHexString(attestation.taskHash, 32)) {
      throw new Error("completion attestation taskHash must be bytes32");
    }

    const completedAt = Date.parse(attestation.completedAt);
    if (!Number.isFinite(completedAt)) {
      throw new Error("completion attestation completedAt must be a valid ISO timestamp");
    }

    const now = this.now().getTime();
    const ageMs = now - completedAt;
    if (ageMs < -this.clockSkewMs) {
      throw new Error("completion attestation timestamp is in the future");
    }
    if (this.maxAgeMs > 0 && ageMs > this.maxAgeMs) {
      throw new Error("completion attestation has expired");
    }

    if (job.resultHash && job.resultHash !== attestation.resultHash) {
      throw new Error("completion attestation resultHash does not match the job");
    }
    if (job.completedAt && job.completedAt !== attestation.completedAt) {
      throw new Error("completion attestation completedAt does not match the job");
    }

    if (this.allowedSigners && !this.allowedSigners.has(attestation.signer.toLowerCase())) {
      throw new Error("completion attestation signer is not allowed");
    }

    return { valid: true, ageMs: Math.max(0, ageMs) };
  }
}
