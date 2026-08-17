import { getAddress, keccak256, toUtf8Bytes, verifyMessage } from "ethers";
import type { AIJobRecord } from "./types.js";

export const COMPLETION_ATTESTATION_VERSION = "AI_HUB_JOB_COMPLETION_V1";

export interface CompletionAttestationPayload {
  version: typeof COMPLETION_ATTESTATION_VERSION;
  jobId: string;
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
  signMessage(message: string): Promise<string>;
}

function required(value: string, name: string): string {
  if (!value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

export function canonicalCompletionMessage(payload: CompletionAttestationPayload): string {
  return [
    required(payload.version, "attestation version"),
    `jobId=${required(payload.jobId, "attestation jobId")}`,
    `agentId=${required(payload.agentId, "attestation agentId")}`,
    `taskHash=${required(payload.taskHash, "attestation taskHash")}`,
    `resultHash=${required(payload.resultHash, "attestation resultHash")}`,
    `completedAt=${required(payload.completedAt, "attestation completedAt")}`,
  ].join("\n");
}

/**
 * Must stay byte-for-byte compatible with AICompletionReporter.expectedCompletionId().
 * Solidity normalizes the attester address to a lowercase 20-byte hex string,
 * so the off-chain side must do the same before hashing.
 */
export function completionIdFromPayload(
  payload: CompletionAttestationPayload,
  signer: string,
): string {
  const normalizedSigner = getAddress(signer).toLowerCase();
  return keccak256(toUtf8Bytes([
    payload.version,
    payload.jobId,
    payload.agentId,
    payload.taskHash,
    payload.resultHash,
    payload.completedAt,
    normalizedSigner,
  ].join("\n")));
}

export function resultHashBytes32(resultHash: string): string {
  return keccak256(toUtf8Bytes(required(resultHash, "resultHash")));
}

export function payloadFromJob(job: AIJobRecord): CompletionAttestationPayload {
  if (job.status !== "completed") throw new Error("only completed jobs can be attested");
  if (!job.resultHash) throw new Error("completed job has no resultHash");
  if (!job.completedAt) throw new Error("completed job has no completedAt timestamp");

  return {
    version: COMPLETION_ATTESTATION_VERSION,
    jobId: job.id,
    agentId: job.agentId,
    taskHash: job.taskHash,
    resultHash: job.resultHash,
    completedAt: job.completedAt,
  };
}

export async function createCompletionAttestation(
  job: AIJobRecord,
  signer: AttestationSigner,
): Promise<CompletionAttestation> {
  const payload = payloadFromJob(job);
  const signerAddress = getAddress(await signer.getAddress());
  const signature = await signer.signMessage(canonicalCompletionMessage(payload));

  return {
    ...payload,
    signer: signerAddress,
    signature,
  };
}

export function verifyCompletionAttestation(
  attestation: CompletionAttestation,
): boolean {
  try {
    const recovered = getAddress(
      verifyMessage(canonicalCompletionMessage(attestation), attestation.signature),
    );
    return recovered === getAddress(attestation.signer);
  } catch {
    return false;
  }
}

export function assertValidCompletionAttestation(
  attestation: CompletionAttestation,
): void {
  if (attestation.version !== COMPLETION_ATTESTATION_VERSION) {
    throw new Error("unsupported completion attestation version");
  }
  required(attestation.jobId, "attestation jobId");
  required(attestation.agentId, "attestation agentId");
  required(attestation.taskHash, "attestation taskHash");
  required(attestation.resultHash, "attestation resultHash");
  required(attestation.completedAt, "attestation completedAt");
  getAddress(attestation.signer);
  required(attestation.signature, "attestation signature");

  if (!verifyCompletionAttestation(attestation)) {
    throw new Error("invalid completion attestation signature");
  }
}
