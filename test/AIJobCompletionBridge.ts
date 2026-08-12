import { expect } from "chai";
import { Wallet } from "ethers";
import { AIJobCompletionBridge, MemoryCompletionSink } from "../agents/ai-jobs/completion-bridge.js";
import type { AIJobRecord } from "../agents/ai-jobs/types.js";

function completedJob(): AIJobRecord {
  return {
    idempotencyKey: "bridge:test:1",
    agentId: "drop-hunter",
    taskHash: "sha256:task-bridge",
    prompt: "Create an execution plan.",
    reward: "25",
    trigger: "opportunity",
    id: "job_bridge_1",
    status: "completed",
    attempts: 1,
    createdAt: "2026-08-12T11:00:00.000Z",
    startedAt: "2026-08-12T11:00:01.000Z",
    completedAt: "2026-08-12T11:00:03.000Z",
    updatedAt: "2026-08-12T11:00:03.000Z",
    resultHash: "sha256:result-bridge",
  };
}

describe("AI job completion bridge", function () {
  it("publishes a signed completion exactly once", async function () {
    const sink = new MemoryCompletionSink();
    const bridge = new AIJobCompletionBridge(sink);
    const signer = Wallet.createRandom();

    const first = await bridge.publish(completedJob(), signer);
    const second = await bridge.publish(completedJob(), signer);

    expect(first.reused).to.equal(false);
    expect(second.reused).to.equal(true);
    expect(second.transactionId).to.equal(first.transactionId);
    expect(sink.submissions).to.have.length(1);
    expect(bridge.hasPublished("job_bridge_1")).to.equal(true);
  });

  it("rejects a non-completed job before crossing the sink boundary", async function () {
    const sink = new MemoryCompletionSink();
    const bridge = new AIJobCompletionBridge(sink);
    const signer = Wallet.createRandom();
    const job = completedJob();
    job.status = "running";

    await expect(bridge.publish(job, signer)).to.be.rejectedWith(
      "only completed jobs can be attested",
    );
    expect(sink.submissions).to.have.length(0);
  });

  it("exposes the published record without resubmitting it", async function () {
    const sink = new MemoryCompletionSink();
    const bridge = new AIJobCompletionBridge(sink);
    const signer = Wallet.createRandom();

    const published = await bridge.publish(completedJob(), signer);
    const stored = bridge.getPublished("job_bridge_1");

    expect(stored).to.not.equal(undefined);
    expect(stored?.transactionId).to.equal(published.transactionId);
    expect(stored?.attestation.resultHash).to.equal("sha256:result-bridge");
  });
});
