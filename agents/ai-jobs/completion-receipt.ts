import { createHash } from "node:crypto";
import type { AIJobRecord } from "./types.js";

export interface AIJobCompletionReceipt {
  version: "1";
  jobId: string;
  agentId: string;
  taskHash: string;
  resultHash: string;
  outputHash: string;
  completedAt: string;
  receiptHash: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalReceiptPayload(job: AIJobRecord, output: string): string {
  if (job.status !== "completed") throw new Error("only completed jobs can create a receipt");
  if (!job.completedAt) throw new Error("completed job must have completedAt");
  if (!job.resultHash?.trim()) throw new Error("completed job must have resultHash");

  return [
    "AI_HUB_JOB_COMPLETION_V1",
    `jobId=${job.id}`,
    `agentId=${job.agentId}`,
    `taskHash=${job.taskHash}`,
    `resultHash=${job.resultHash}`,
    `completedAt=${job.completedAt}`,
    `outputHash=${sha256(output)}`,
  ].join("\n");
}

export function createCompletionReceipt(job: AIJobRecord, output = ""): AIJobCompletionReceipt {
  const outputHash = `sha256:${sha256(output)}`;
  const payload = canonicalReceiptPayload(job, output);

  return {
    version: "1",
    jobId: job.id,
    agentId: job.agentId,
    taskHash: job.taskHash,
    resultHash: job.resultHash!,
    outputHash,
    completedAt: job.completedAt!,
    receiptHash: `sha256:${sha256(payload)}`,
  };
}

export function verifyCompletionReceipt(job: AIJobRecord, receipt: AIJobCompletionReceipt, output = ""): boolean {
  try {
    const expected = createCompletionReceipt(job, output);
    return (
      receipt.version === expected.version &&
      receipt.jobId === expected.jobId &&
      receipt.agentId === expected.agentId &&
      receipt.taskHash === expected.taskHash &&
      receipt.resultHash === expected.resultHash &&
      receipt.outputHash === expected.outputHash &&
      receipt.completedAt === expected.completedAt &&
      receipt.receiptHash === expected.receiptHash
    );
  } catch {
    return false;
  }
}
