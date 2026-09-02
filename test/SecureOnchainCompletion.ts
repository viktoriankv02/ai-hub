import { expect } from "chai";
import { Wallet } from "ethers";
import { MemoryCompletionPublicationStore } from "../agents/ai-jobs/completion-store.js";
import { MemoryCompletionSink } from "../agents/ai-jobs/completion-bridge.js";
import { SecureOnchainCompletionCoordinator } from "../agents/ai-jobs/secure-onchain-completion.js";
import type { OnchainJobProvisioner } from "../agents/ai-jobs/onchain-job-provisioner.js";
import type { AIJobRecord } from "../agents/ai-jobs/types.js";

function completedJob(): AIJobRecord {
  return {
    idempotencyKey: "secure:test:1",
    agentId: "1",
    taskHash: "secure-task",
    prompt: "execute",
    reward: "1",
    trigger: "manual",
    id: "secure_job_1",
    status: "completed",
    attempts: 1,
    createdAt: "2026-08-17T10:00:00.000Z",
    startedAt: "2026-08-17T10:00:01.000Z",
    completedAt: "2026-08-17T10:00:05.000Z",
    updatedAt: "2026-08-17T10:00:05.000Z",
    resultHash: "secure-result",
  };
}

describe("SecureOnchainCompletionCoordinator", function () {
  it("validates the completion before submitting it", async function () {
    const wallet = Wallet.createRandom();
    const sink = new MemoryCompletionSink();
    const store = new MemoryCompletionPublicationStore();
    const provisioner = {
      provision: async () => ({
        offchainJobId: "secure_job_1",
        onchainJobId: 9n,
        transactionId: "0xprovision",
        reused: false,
      }),
    } as unknown as OnchainJobProvisioner;

    const coordinator = new SecureOnchainCompletionCoordinator({
      provisioner,
      sink,
      attestationSigner: wallet,
      completionStore: store,
      completionPolicy: {
        maxAgeMs: 60_000,
        now: () => new Date("2026-08-17T10:00:30.000Z"),
        allowedSigners: [await wallet.getAddress()],
      },
    });

    const result = await coordinator.submit(completedJob());
    expect(result.reused).to.equal(false);
    expect(result.transactionId).to.equal("memory:secure_job_1:1");
    expect(sink.submissions).to.have.length(1);
    expect(store.get("secure_job_1")?.transactionId).to.equal(result.transactionId);
  });

  it("does not submit a stale completion", async function () {
    const wallet = Wallet.createRandom();
    const sink = new MemoryCompletionSink();
    const coordinator = new SecureOnchainCompletionCoordinator({
      provisioner: {
        provision: async () => ({
          offchainJobId: "secure_job_1",
          onchainJobId: 9n,
          transactionId: "0xprovision",
          reused: false,
        }),
      } as unknown as OnchainJobProvisioner,
      sink,
      attestationSigner: wallet,
      completionStore: new MemoryCompletionPublicationStore(),
      completionPolicy: {
        maxAgeMs: 10_000,
        now: () => new Date("2026-08-17T10:01:00.000Z"),
      },
    });

    await expect(coordinator.submit(completedJob())).to.be.rejectedWith(
      "completion attestation has expired",
    );
    expect(sink.submissions).to.have.length(0);
  });

  it("reuses persisted publication without sending a second transaction", async function () {
    const wallet = Wallet.createRandom();
    const sink = new MemoryCompletionSink();
    const store = new MemoryCompletionPublicationStore();
    const provisioner = {
      provision: async () => ({
        offchainJobId: "secure_job_1",
        onchainJobId: 9n,
        transactionId: "0xprovision",
        reused: false,
      }),
    } as unknown as OnchainJobProvisioner;

    const first = new SecureOnchainCompletionCoordinator({
      provisioner,
      sink,
      attestationSigner: wallet,
      completionStore: store,
      completionPolicy: { now: () => new Date("2026-08-17T10:00:30.000Z") },
    });
    const firstResult = await first.submit(completedJob());

    const second = new SecureOnchainCompletionCoordinator({
      provisioner,
      sink,
      attestationSigner: wallet,
      completionStore: store,
      completionPolicy: { now: () => new Date("2026-08-17T12:00:30.000Z") },
    });
    const secondResult = await second.submit(completedJob());

    expect(firstResult.transactionId).to.equal(secondResult.transactionId);
    expect(secondResult.reused).to.equal(true);
    expect(sink.submissions).to.have.length(1);
  });
});
