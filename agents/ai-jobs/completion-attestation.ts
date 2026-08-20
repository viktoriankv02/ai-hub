import { getAddress, getBytes, id, isHexString, keccak256, toUtf8Bytes, verifyMessage } from "ethers";
import type { AIJobRecord } from "./types.js";

export const COMPLETION_ATTESTATION_VERSION = "AI_HUB_JOB_COMPLETION_V1";

export interface CompletionAttestationPayload {
  version: typeof COMPLETION_ATTESTATION_VERSION;
  jobId: string;
  /** Optional numeric on-chain job id. When present, it is the value signed for EVM settlement. */
  onchainJobId?: string;
  agentId: string;
  taskHash: string;
  resultHash: string;
  completedAt: string;
}

export interface CompletionAttestation extends CompletionAttestationPayload {
  signer: string;
  signature: string;
}

export interface AttestationSigner {
  getAddress(): Promise<string>;
  signMessage(message: string | Uint8Array): Promise<string>;
}

export function canonicalTaskHash(taskHash: string): string {
  const value = taskHash.trim();
  if (!value) throw new Error("taskHash is required");
  return isHexString(value, 32) ? value : id(value);
}

export function canonicalOnchainJobId(value: bigint | number | string): string {
  const normalized = typeof value === "bigint" ? value.toString() : String(value).trim();
  if (!/^\d+$/.test(normalized) || BigInt(normalized) < 1n) {
    throw new Error("onchainJobId must be a positive integer");
  }
  return normalized;
}

export function canonicalCompletionMessage(payload: CompletionAttestationPayload): string {
  const signedJobId = payload.onchainJobId?.trim() || payload.jobId;
  return [
    payload.version,
    `jobId=${signedJobId}`,
    `agentId=${payload.agentId}`,
    `taskHash=${payload.taskHash}`,
    `resultHash=${payload.resultHash}`,
    `completedAt=${payload.completedAt}`,
  ].join("\n");
}

function completionSigningDigest(payload: CompletionAttestationPayload): Uint8Array {
  return getBytes(keccak256(toUtf8Bytes(canonicalCompletionMessage(payload))));
}

export function payloadFromJob(
  job: AIJobRecord,
  onchainJobId?: bigint | number | string,
): CompletionAttestationPayload {
  if (job.status !== "completed") throw new Error("only completed jobs can be attested");
  if (!job.resultHash) throw new Error("completed job has no resultHash");
  if (!job.completedAt) throw new Error("completed job has no completedAt timestamp");

  return {
    version: COMPLETION_ATTESTATION_VERSION,
    jobId: job.id,
    onchainJobId: onchainJobId === undefined ? undefined : canonicalOnchainJobId(onchainJobId),
    agentId: job.agentId,
    taskHash: canonicalTaskHash(job.taskHash),
    resultHash: job.resultHash,
    completedAt: job.completedAt,
  };
}

export async function createCompletionAttestation(
  job: AIJobRecord,
  signer: AttestationSigner,
  onchainJobId?: bigint | number | string,
): Promise<CompletionAttestation> {
  const payload = payloadFromJob(job, onchainJobId);
  const signature = await signer.signMessage(completionSigningDigest(payload));
  const signerAddress = getAddress(await signer.getAddress());

  return {
    ...payload,
    signer: signerAddress,
    signature,
  };
}

export function verifyCompletionAttestation(attestation: CompletionAttestation): boolean {
  try {
    const recovered = getAddress(
      verifyMessage(completionSigningDigest(attestation), attestation.signature),
    );
    return recovered === getAddress(attestation.signer);
  } catch {
    return false;
  }
}

export function assertValidCompletionAttestation(attestation: CompletionAttestation): void {
  if (attestation.version !== COMPLETION_ATTESTATION_VERSION) {
    throw new Error("unsupported completion attestation version");
  }
  if (!attestation.jobId.trim()) throw new Error("attestation jobId is required");
  if (attestation.onchainJobId !== undefined) canonicalOnchainJobId(attestation.onchainJobId);
  if (!attestation.agentId.trim()) throw new Error("attestation agentId is required");
  if (!isHexString(attestation.taskHash, 32)) throw new Error("attestation taskHash must be a 32-byte hex value");
  if (!attestation.resultHash.trim()) throw new Error("attestation resultHash is required");
  if (!attestation.completedAt.trim()) throw new Error("attestation completedAt is required");
  if (!attestation.signer.trim()) throw new Error("attestation signer is required");
  if (!attestation.signature.trim()) throw new Error("attestation signature is required");
  if (!verifyCompletionAttestation(attestation)) {
    throw new Error("invalid completion attestation signature");
  }
}
