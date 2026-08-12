import { expect } from "chai";
import { network } from "hardhat";
import { MemoryOnchainJobBindingStore } from "../agents/ai-jobs/onchain-job-bindings.js";
import { OnchainJobProvisioner } from "../agents/ai-jobs/onchain-job-provisioner.js";
import type { AIJobRecord } from "../agents/ai-jobs/types.js";

const { ethers } = await network.connect();

function job(): AIJobRecord {
  return {
    idempotencyKey: "provision:test",
    agentId: "1",
    taskHash: "sha256:provision-task",
    prompt: "run funded task",
    reward: "1000000000000000000",
    trigger: "opportunity",
    id: "job_provision_1",
    status: "completed",
    attempts: 1,
    createdAt: "2026-08-12T13:00:00.000Z",
    startedAt: "2026-08-12T13:00:01.000Z",
    completedAt: "2026-08-12T13:00:05.000Z",
    updatedAt: "2026-08-12T13:00:05.000Z",
    resultHash: "sha256:result",
  };
}

describe("OnchainJobProvisioner", function () {
  it("funds, creates, binds and assigns an onchain job", async function () {
    const [owner, developer] = await ethers.getSigners();
    const ownerAddress = await owner.getAddress();
    const developerAddress = await developer.getAddress();

    const token = await ethers.deployContract("MockRewardToken");
    await token.waitForDeployment();
    const runtime = await ethers.deployContract("AIAgentRuntime", [ownerAddress]);
    await runtime.waitForDeployment();
    const engine = await ethers.deployContract("AIAgentEngine", [ownerAddress, await runtime.getAddress(), await token.getAddress()]);
    await engine.waitForDeployment();

    await (await runtime.connect(developer).registerAgent("Worker", "endpoint", "metadata", "1.0.0")).wait();
    await (await runtime.connect(owner).setVerified(1, true)).wait();
    await (await runtime.connect(developer).startAgent(1)).wait();

    const reward = ethers.parseEther("1");
    await (await token.transfer(developerAddress, reward)).wait();

    const bindings = new MemoryOnchainJobBindingStore();
    const provisioner = new OnchainJobProvisioner({
      signer: developer,
      engineAddress: await engine.getAddress(),
      rewardTokenAddress: await token.getAddress(),
      bindings,
      resolveAgentId: async () => 1n,
      autoAssign: true,
    });

    const first = await provisioner.provision(job());
    expect(first.reused).to.equal(false);
    expect(first.onchainJobId).to.equal(1n);
    expect(first.approvalTransactionId).to.match(/^0x/);
    expect(first.assignmentTransactionId).to.match(/^0x/);
    expect(bindings.get("job_provision_1")).to.equal(1n);

    const onchainJob = await engine.jobs(1);
    expect(onchainJob.creator).to.equal(developerAddress);
    expect(onchainJob.assigned).to.equal(true);
    expect(onchainJob.reward).to.equal(reward);

    const second = await provisioner.provision(job());
    expect(second.reused).to.equal(true);
    expect(second.onchainJobId).to.equal(1n);
  });
});
