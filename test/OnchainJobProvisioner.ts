import { expect } from "chai";
import { network } from "hardhat";
import { MemoryOnchainJobBindingStore } from "../agents/ai-jobs/onchain-job-bindings.js";
import { OnchainJobProvisioner } from "../agents/ai-jobs/onchain-job-provisioner.js";
import type { AIJobRecord } from "../agents/ai-jobs/types.js";

const { ethers } = await network.connect();

function queuedJob(): AIJobRecord {
  return {
    idempotencyKey: "provision:test:1",
    agentId: "drop-hunter",
    taskHash: "sha256:provision-task",
    prompt: "Execute the selected opportunity.",
    reward: "25",
    trigger: "opportunity",
    opportunityId: "ink-builder",
    id: "job_provision_1",
    status: "queued",
    attempts: 0,
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
  };
}

async function deploySystem() {
  const [owner, developer] = await ethers.getSigners();
  const ownerAddress = await owner.getAddress();

  const token = await ethers.deployContract("MockRewardToken");
  await token.waitForDeployment();

  const runtime = await ethers.deployContract("AIAgentRuntime", [ownerAddress]);
  await runtime.waitForDeployment();

  const engine = await ethers.deployContract("AIAgentEngine", [
    ownerAddress,
    await runtime.getAddress(),
    await token.getAddress(),
  ]);
  await engine.waitForDeployment();

  await (await runtime.connect(developer).registerAgent("Worker", "endpoint", "metadata", "1.0.0")).wait();
  await (await runtime.connect(owner).setVerified(1, true)).wait();
  await (await runtime.connect(developer).startAgent(1)).wait();

  const reward = ethers.parseEther("25");
  await (await token.transfer(await developer.getAddress(), reward)).wait();
  await (await token.connect(developer).approve(await engine.getAddress(), reward * 2n)).wait();

  return { owner, developer, token, runtime, engine };
}

describe("OnchainJobProvisioner", function () {
  it("creates an onchain job, stores the binding and remains idempotent", async function () {
    const { developer, engine } = await deploySystem();
    const store = new MemoryOnchainJobBindingStore();
    const provisioner = new OnchainJobProvisioner({
      signer: developer,
      engineAddress: await engine.getAddress(),
      bindingStore: store,
      agentId: 1,
      autoAssign: false,
    });

    const job = queuedJob();
    const first = await provisioner.provision(job);

    expect(first.reused).to.equal(false);
    expect(first.onchainJobId).to.equal(1n);
    expect(first.createdTransactionId).to.match(/^0x[0-9a-f]{64}$/i);
    expect(first.assignedTransactionId).to.equal(undefined);
    expect(store.get(job.id)).to.equal(1n);

    const onchain = await engine.jobs(1);
    expect(onchain.id).to.equal(1n);
    expect(onchain.agentId).to.equal(1n);
    expect(onchain.taskHash).to.equal(ethers.id(job.taskHash));
    expect(onchain.reward).to.equal(ethers.parseEther("25"));
    expect(onchain.assigned).to.equal(false);

    const second = await provisioner.provision(job);
    expect(second.reused).to.equal(true);
    expect(second.onchainJobId).to.equal(1n);
    expect(second.createdTransactionId).to.equal(undefined);
    expect(await engine.nextJobId()).to.equal(2n);
  });

  it("can create and assign a job when the provisioning signer is the engine owner", async function () {
    const { owner, engine } = await deploySystem();
    const store = new MemoryOnchainJobBindingStore();
    const provisioner = new OnchainJobProvisioner({
      signer: owner,
      engineAddress: await engine.getAddress(),
      bindingStore: store,
      agentId: 1,
      autoAssign: true,
    });

    const job = { ...queuedJob(), id: "job_provision_assign" };
    const reward = ethers.parseEther("25");
    const token = await ethers.getContractAt("MockRewardToken", await engine.rewardToken());
    await (await token.transfer(await owner.getAddress(), reward)).wait();
    await (await token.connect(owner).approve(await engine.getAddress(), reward)).wait();

    const result = await provisioner.provision(job);
    expect(result.reused).to.equal(false);
    expect(result.assignedTransactionId).to.match(/^0x[0-9a-f]{64}$/i);
    expect((await engine.jobs(result.onchainJobId)).assigned).to.equal(true);
  });

  it("rejects invalid reward values before spending gas", async function () {
    const { developer, engine } = await deploySystem();
    const store = new MemoryOnchainJobBindingStore();
    const provisioner = new OnchainJobProvisioner({
      signer: developer,
      engineAddress: await engine.getAddress(),
      bindingStore: store,
      agentId: 1,
      autoAssign: false,
    });

    let message = "";
    try {
      await provisioner.provision({ ...queuedJob(), id: "job_zero_reward", reward: "0" });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).to.equal("job.reward must be positive");
  });
});
