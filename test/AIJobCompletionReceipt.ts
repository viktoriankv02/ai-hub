import { expect } from "chai";
import { createCompletionReceipt, verifyCompletionReceipt } from "../agents/ai-jobs/completion-receipt.js";
import type { AIJobRecord } from "../agents/ai-jobs/types.js";

function completedJob(): AIJobRecord {
  return {
    id: "job-42",
    agentId: "agent-7",
    taskHash: "sha256:task",
    prompt: "execute task",
    reward: "100",
    trigger: "opportunity",
    status: "completed",
    attempts: 1,
    createdAt: "2026-08-13T10:00:00.000Z",
    startedAt: "2026-08-13T10:00:01.000Z",
    completedAt: "2026-08-13T10:00:03.000Z",
    updatedAt: "2026-08-13T10:00:03.000Z",
    resultHash: "sha256:result",
  };
}

describe("AIJobCompletionReceipt", function () {
  it("creates a deterministic receipt", function () {
    const job = completedJob();
    const first = createCompletionReceipt(job, "hello world");
    const second = createCompletionReceipt(job, "hello world");

    expect(first).to.deep.equal(second);
    expect(first.version).to.equal("1");
    expect(first.jobId).to.equal("job-42");
    expect(first.outputHash).to.match(/^sha256:[0-9a-f]{64}$/);
    expect(first.receiptHash).to.match(/^sha256:[0-9a-f]{64}$/);
  });

  it("detects tampering with output or receipt fields", function () {
    const job = completedJob();
    const receipt = createCompletionReceipt(job, "hello world");

    expect(verifyCompletionReceipt(job, receipt, "hello world")).to.equal(true);
    expect(verifyCompletionReceipt(job, receipt, "tampered output")).to.equal(false);

    const tampered = { ...receipt, resultHash: "sha256:other" };
    expect(verifyCompletionReceipt(job, tampered, "hello world")).to.equal(false);
  });

  it("requires completed jobs to have completion data", function () {
    const job = { ...completedJob(), status: "queued" as const };
    expect(() => createCompletionReceipt(job, "hello")).to.throw("only completed jobs");
  });
});
