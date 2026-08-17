import { getAddress, id, isHexString, verifyMessage } from "ethers";
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

export function canonicalTaskHash(taskHash: string): string {
  const value = taskHash.trim();
  if (!value) throw new Error("taskHash is required");
  return isHexString(value, 32) ? value : id(value);
}

export function canonicalCompletionMessage(payload: CompletionAttestationPayload): string {
  return [
    payload.version,
    `jobId=${payload.jobId}`,
    `agentId=${payload.agentId}`,
    `taskHash=${payload.taskHash}`,
    `resultHash=${payload.resultHash}`,
    `completedAt=${payload.completedAt}`,
  ].join("\n");
}

export function payloadFromJob(job: AIJobRecord): CompletionAttestationPayload {
  if (job.status !== "completed") throw new Error("only completed jobs can be attested");
  if (!job.resultHash) throw new Error("completed job has no resultHash");
  if (!job.completedAt) throw new Error("completed job has no completedAt timestamp");

  return {
    version: COMPLETION_ATTESTATION_VERSION,
    jobId: job.id,
    agentId: job.agentId,
    taskHash: canonicalTaskHash(job.taskHash),
    resultHash: job.resultHash,
    completedAt: job.completedAt,
  };
}

export async function createCompletionAttestation(
  job: AIJobRecord,
  signer: AttestationSigner,
): Promise<CompletionAttestation> {
  const payload = payloadFromJob(job);
  const signature = await signer.signMessage(canonicalCompletionMessage(payload));
  const signerAddress = getAddress(await signer.getAddress());

  return {
    ...payload,
    signer: signerAddress,
    signature,
  };
}

export function verifyCompletionAttestation(attestation: CompletionAttestation): boolean {
  const recovered = getAddress(
    verifyMessage(canonicalCompletionMessage(attestation), attestation.signature),
  );
  return recovered === getAddress(attestation.signer);
}

export function assertValidCompletionAttestation(attestation: CompletionAttestation): void {
  if (attestation.version !== COMPLETION_ATTESTATION_VERSION) {
    throw new Error("unsupported completion attestation version");
  }
  if (!attestation.jobId.trim()) throw new Error("attestation jobId is required");
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
