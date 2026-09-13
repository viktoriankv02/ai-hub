import type { DropHunterProjectRecord, StoredDropTask } from "./product-store.js";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export interface DeploymentSubmissionGuardInput {
  task: Pick<StoredDropTask, "id" | "status" | "txHashes">;
  transactionHash: string;
  expectedPreviewHash: string;
  submittedPreviewHash: string;
}

export interface DeploymentSubmissionGuardResult {
  transactionHash: string;
  idempotent: boolean;
}

export function guardDeploymentSubmission(input: DeploymentSubmissionGuardInput): DeploymentSubmissionGuardResult {
  const transactionHash = requireDeploymentTransactionHash(input.transactionHash);
  if (!input.expectedPreviewHash || input.submittedPreviewHash !== input.expectedPreviewHash) {
    throw new Error("deployment preview hash does not match the approved payload");
  }
  if (input.task.status !== "ready" && input.task.status !== "running") {
    throw new Error(`deployment task must be approved before submission: ${input.task.id}`);
  }

  const existing = input.task.txHashes ?? [];
  const same = existing.some((hash) => hash.toLowerCase() === transactionHash.toLowerCase());
  if (input.task.status === "running") {
    if (same) return { transactionHash, idempotent: true };
    throw new Error("deployment task already has a submitted transaction");
  }
  if (existing.length > 0 && !same) throw new Error("approved deployment task already contains a different transaction");
  return { transactionHash, idempotent: same };
}

export function requireDeploymentTransactionHash(value: string): string {
  if (!TX_HASH_RE.test(value)) throw new Error("invalid deployment transaction hash");
  return value;
}

export function requireDeploymentChainId(project: Pick<DropHunterProjectRecord, "id" | "opportunity">): number {
  const chainId = project.opportunity.chainId;
  if (typeof chainId !== "number" || !Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`project ${project.id} does not have a valid EVM chainId`);
  }
  return chainId;
}

export function taskHasDeploymentTransaction(task: Pick<StoredDropTask, "txHashes">, transactionHash: string): boolean {
  const normalized = requireDeploymentTransactionHash(transactionHash).toLowerCase();
  return (task.txHashes ?? []).some((hash) => hash.toLowerCase() === normalized);
}
