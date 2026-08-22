import { expect } from "chai";
import { Wallet } from "ethers";
import { OnchainCompletionCoordinator } from "../agents/ai-jobs/onchain-completion-coordinator.js";
import { MemoryCompletionSink } from "../agents/ai-jobs/completion-bridge.js";
import type { OnchainJobProvisioner } from "../agents/ai-jobs/onchain-job-provisioner.js";
import type { AIJobRecord } from "../agents/ai-jobs/types.js";

function job(status: AIJobRecord["status"] = "completed"): AIJobRecord {
  return {
    idempotencyKey: "coordinator:test:1",
    agentId: "1",
    taskHash: "sha256:task",
    prompt: "execute",
    reward: "100",
    trigger: "opportunity",
    id: "job_coordinator_1",
    status,
    attempts: 1,
    createdAt: "2026-08-12T12:00:00.000Z",
    startedAt: "2026-08-12T12:00:01.000Z",
    completedAt: "2026-08-12T12:00:05.000Z",
    updatedAt: "2026-08-12T12:00:05.000Z",
    resultHash: "sha256:result",
  };
}

describe("OnchainCompletionCoordinator", function () {
  it("provisions and publishes a completed job exactly once", async function () {
    const sink = new MemoryCompletionSink();
    const provisioner = {
      provision: async () => ({
        offchainJobId: "job_coordinator_1",
        onchainJobId: 7n,
        transactionId: "0xprovision",
        reused: false,
      }),
    } as unknown as OnchainJobProvisioner;

    const signer = Wallet.createRandom();
    const coordinator = new OnchainCompletionCoordinator({
      provisioner,
      sink,
      attestationSigner: signer,
    });

    const result = await coordinator.attestAndSubmit(job());
    expect(result.provisioning.onchainJobId).to.equal(7n);
    expect(result.completion.reused).to.equal(false);
    expect(sink.submissions).to.have.length(1);

    expect(coordinator.hasSubmitted("job_coordinator_1")).to.equal(true);
  });

  it("does not provision an incomplete job", async function () {
    let called = false;
    const provisioner = {
      provision: async () => {
        called = true;
        throw new Error("should not execute");
      },
    } as unknown as OnchainJobProvisioner;

    const coordinator = new OnchainCompletionCoordinator({
      provisioner,
      sink: new MemoryCompletionSink(),
      attestationSigner: Wallet.createRandom(),
    });

    await expect(coordinator.provision(job("running"))).to.be.rejectedWith(
      "only completed jobs can be provisioned on-chain",
    );
    expect(called).to.equal(false);
  });
});
