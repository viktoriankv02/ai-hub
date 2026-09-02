import { expect } from "chai";
import { Wallet } from "ethers";
import { CompletionPublicationPipeline, MemoryCompletionPublisher } from "../agents/ai-jobs/completion-publisher.js";
import { MemoryCompletionPublicationStore } from "../agents/ai-jobs/completion-store.js";
import type { AIJobRecord } from "../agents/ai-jobs/types.js";

function completedJob(overrides: Partial<AIJobRecord> = {}): AIJobRecord {
  return {
    idempotencyKey: "completion-test-1",
    agentId: "1",
    taskHash: "TASK_PIPELINE",
    prompt: "execute task",
    reward: "10",
    trigger: "manual",
    id: "job-1",
    status: "completed",
    attempts: 1,
    createdAt: "2026-08-18T10:00:00.000Z",
    startedAt: "2026-08-18T10:01:00.000Z",
    completedAt: "2026-08-18T10:02:00.000Z",
    updatedAt: "2026-08-18T10:02:00.000Z",
    resultHash: "RESULT_PIPELINE",
    ...overrides,
  };
}

describe("CompletionPublicationPipeline", function () {
  it("signs, publishes and persists a completed job", async function () {
    const wallet = Wallet.createRandom();
    const store = new MemoryCompletionPublicationStore();
    const publisher = new MemoryCompletionPublisher();
    const pipeline = new CompletionPublicationPipeline(store, publisher, {
      now: () => new Date("2026-08-18T12:00:00.000Z"),
    });

    const result = await pipeline.publishCompletedJob(completedJob(), wallet);

    expect(result.jobId).to.equal("job-1");
    expect(result.transactionId).to.match(/^0x[0-9a-f]{64}$/);
    expect(result.publishedAt).to.equal("2026-08-18T12:00:00.000Z");
    expect(result.attestation.signer).to.equal(wallet.address);
    expect(result.attestation.taskHash).to.match(/^0x[0-9a-f]{64}$/);
    expect(store.get("job-1")?.transactionId).to.equal(result.transactionId);
  });

  it("is idempotent after the completion has already been published", async function () {
    const wallet = Wallet.createRandom();
    const store = new MemoryCompletionPublicationStore();
    const publisher = new MemoryCompletionPublisher();
    const pipeline = new CompletionPublicationPipeline(store, publisher);
    const job = completedJob();

    const first = await pipeline.publishCompletedJob(job, wallet);
    const second = await pipeline.publishCompletedJob(job, wallet);

    expect(second.transactionId).to.equal(first.transactionId);
    expect(second.attestation.signature).to.equal(first.attestation.signature);
  });

  it("rejects queued jobs because only completed jobs may be attested", async function () {
    const wallet = Wallet.createRandom();
    const pipeline = new CompletionPublicationPipeline(
      new MemoryCompletionPublicationStore(),
      new MemoryCompletionPublisher(),
    );

    await expect(
      pipeline.publishCompletedJob(completedJob({ status: "queued", completedAt: undefined, resultHash: undefined }), wallet),
    ).to.be.rejectedWith("only completed jobs can be attested");
  });
});
