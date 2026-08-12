import { expect } from "chai";
import { Wallet } from "ethers";
import { OnchainCompletionCoordinator } from "../agents/ai-jobs/onchain-completion-coordinator.js";
import { OnchainJobProvisioner } from "../agents/ai-jobs/onchain-job-provisioner.js";
import type { CompletionAttestation } from "../agents/ai-jobs/completion-bridge.js";
import type { AIJobRecord } from "../agents/ai-jobs/types.js";

function completedJob(): AIJobRecord {
  return {
    idempotencyKey: "coordinator:test:1",
    agentId: "drop-hunter",
    taskHash: "sha256:coordinator-task",
    prompt: "Execute the selected opportunity.",
    reward: "25",
    trigger: "opportunity",
    opportunityId: "ink-builder",
    id: "job_coordinator_1",
    status: "completed",
    attempts: 1,
    createdAt: "2026-08-12T12:00:00.000Z",
    startedAt: "2026-08-12T12:00:01.000Z",
    completedAt: "2026-08-12T12:00:05.000Z",
    updatedAt: "2026-08-12T12:00:05.000Z",
    resultHash: "sha256:coordinator-result",
  };
}

describe("OnchainCompletionCoordinator", function () {
  it("refuses to attest incomplete jobs", async function () {
    const attestor = Wallet.createRandom();
    const sink = { submit: async () => "0xignored" };
    const provisioner = {} as OnchainJobProvisioner;
    const coordinator = new OnchainCompletionCoordinator({ provisioner, attestor, sink });

    await expectRejection(
      coordinator.attestAndSubmit({ ...completedJob(), status: "running" }),
      "only completed jobs can be submitted on-chain",
    );
  });

  it("signs a completed job and sends exactly one attestation to the sink", async function () {
    const attestor = Wallet.createRandom();
    const submitted: CompletionAttestation[] = [];
    const sink = {
      submit: async (attestation: CompletionAttestation) => {
        submitted.push(attestation);
        return "0xcoordinator_tx";
      },
    };
    const provisioningCalls: AIJobRecord[] = [];
    const provisioner = {
      provision: async (job: AIJobRecord) => {
        provisioningCalls.push(job);
        return { offchainJobId: job.id, onchainJobId: 42n, reused: false };
      },
    } as unknown as OnchainJobProvisioner;

    const coordinator = new OnchainCompletionCoordinator({ provisioner, attestor, sink });
    const job = completedJob();
    const result = await coordinator.attestAndSubmit(job);

    expect(result.transactionId).to.equal("0xcoordinator_tx");
    expect(result.onchainJobId).to.equal(42n);
    expect(result.offchainJobId).to.equal(job.id);
    expect(result.attestationSigner).to.equal(await attestor.getAddress());
    expect(provisioningCalls).to.have.length(1);
    expect(submitted).to.have.length(1);
    expect(submitted[0].jobId).to.equal(job.id);
    expect(submitted[0].resultHash).to.equal(job.resultHash);
  });

  it("uses the same provision-and-submit lifecycle without duplicate provisioning", async function () {
    const attestor = Wallet.createRandom();
    const sink = {
      submit: async () => "0xcoordinator_tx_2",
    };
    let calls = 0;
    const provisioner = {
      provision: async (job: AIJobRecord) => {
        calls += 1;
        return { offchainJobId: job.id, onchainJobId: 7n, reused: false };
      },
    } as unknown as OnchainJobProvisioner;

    const coordinator = new OnchainCompletionCoordinator({ provisioner, attestor, sink });
    const result = await coordinator.provisionAndSubmit(completedJob());

    expect(result.onchainJobId).to.equal(7n);
    expect(calls).to.equal(1);
  });
});

async function expectRejection(promise: Promise<unknown>, message: string): Promise<void> {
  let actual = "";
  try {
    await promise;
  } catch (error) {
    actual = error instanceof Error ? error.message : String(error);
  }
  expect(actual).to.equal(message);
}
