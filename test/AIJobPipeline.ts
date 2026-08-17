import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();
const INK_SEPOLIA = 763373n;

describe("AI agent job pipeline", function () {
  async function deploySystem() {
    const [owner, developer, reporter] = await ethers.getSigners();
    const ownerAddress = await owner.getAddress();
    const token = await ethers.deployContract("MockRewardToken");
    await token.waitForDeployment();
    const runtime = await ethers.deployContract("AIAgentRuntime", [ownerAddress]);
    await runtime.waitForDeployment();
    const engine = await ethers.deployContract("AIAgentEngine", [ownerAddress, await runtime.getAddress(), await token.getAddress()]);
    await engine.waitForDeployment();
    const registry = await ethers.deployContract("ActivityRegistry", [ownerAddress]);
    await registry.waitForDeployment();
    const adapter = await ethers.deployContract("AIJobActivityAdapter", [ownerAddress, await engine.getAddress(), await runtime.getAddress(), await registry.getAddress(), INK_SEPOLIA, ethers.id("AI_JOB_COMPLETED"), ethers.id("AI_HUB_JOB_PIPELINE")]);
    await adapter.waitForDeployment();
    await (await registry.setActivityType(ethers.id("AI_JOB_COMPLETED"), true)).wait();
    await (await registry.setReporter(await adapter.getAddress(), true)).wait();
    await (await engine.setCompletionReporter(await reporter.getAddress(), true)).wait();
    await (await engine.setPayoutManager(await owner.getAddress(), true)).wait();
    await (await adapter.setReporter(await reporter.getAddress(), true)).wait();
    return { owner, developer, reporter, token, runtime, engine, registry, adapter };
  }

  async function prepareAgent(system: Awaited<ReturnType<typeof deploySystem>>) {
    const { owner, developer, runtime } = system;
    await (await runtime.connect(developer).registerAgent("Worker", "endpoint", "metadata", "1.0.0")).wait();
    await (await runtime.connect(owner).setVerified(1, true)).wait();
    await (await runtime.connect(developer).startAgent(1)).wait();
  }

  async function fundAndApprove(system: Awaited<ReturnType<typeof deploySystem>>, amount: bigint) {
    const { developer, token, engine } = system;
    await (await token.transfer(await developer.getAddress(), amount)).wait();
    await (await token.connect(developer).approve(await engine.getAddress(), amount)).wait();
  }

  it("registers, verifies and starts an agent", async function () {
    const { owner, developer, runtime } = await deploySystem();
    const developerAddress = await developer.getAddress();
    await (await runtime.connect(developer).registerAgent("Ink Worker", "https://agent.example/execute", "ipfs://agent-metadata", "0.1.0")).wait();
    expect(await runtime.agentOwner(1)).to.equal(developerAddress);
    expect(await runtime.isAgentVerified(1)).to.equal(false);
    await (await runtime.connect(owner).setVerified(1, true)).wait();
    await (await runtime.connect(developer).startAgent(1)).wait();
    expect(await runtime.canExecute(1)).to.equal(true);
  });

  it("creates, assigns and completes a funded AI job", async function () {
    const system = await deploySystem();
    const { owner, developer, reporter, engine } = system;
    const developerAddress = await developer.getAddress();
    await prepareAgent(system);
    const reward = ethers.parseEther("100");
    await fundAndApprove(system, reward);
    await (await engine.connect(developer).createJob(1, ethers.id("TASK_001"), reward)).wait();
    const job = await engine.jobs(1);
    expect(job.creator).to.equal(developerAddress);
    expect(job.reward).to.equal(reward);
    expect(job.assigned).to.equal(false);
    await (await engine.connect(owner).assignJob(1)).wait();
    await (await engine.connect(reporter).completeJob(1, ethers.id("RESULT_001"))).wait();
    const completed = await engine.jobs(1);
    expect(completed.completed).to.equal(true);
    expect(completed.completedAt).to.be.greaterThan(0n);
    expect(await engine.openJobsByCreator(developerAddress)).to.equal(0n);
  });

  it("bridges a completed job into ActivityRegistry exactly once", async function () {
    const system = await deploySystem();
    const { owner, developer, reporter, token, runtime, engine, registry, adapter } = system;
    const developerAddress = await developer.getAddress();
    await prepareAgent(system);
    const reward = ethers.parseEther("10");
    await fundAndApprove(system, reward);
    await (await engine.connect(developer).createJob(1, ethers.id("TASK_002"), reward)).wait();
    await (await engine.connect(owner).assignJob(1)).wait();
    await (await engine.connect(reporter).completeJob(1, ethers.id("RESULT_002"))).wait();
    const metadataHash = ethers.id("JOB_METADATA_002");
    await (await adapter.connect(reporter).reportCompletedJob(1, metadataHash)).wait();
    expect(await registry.totalActivities()).to.equal(1n);
    expect(await registry.activityCount(developerAddress)).to.equal(1n);
    const activity = await registry.getActivity(developerAddress, 0);
    expect(activity.chainId).to.equal(INK_SEPOLIA);
    expect(activity.activityType).to.equal(ethers.id("AI_JOB_COMPLETED"));
    expect(activity.projectId).to.equal(ethers.id("AI_HUB_JOB_PIPELINE"));
    expect(activity.metadataHash).to.equal(metadataHash);
    expect(activity.verified).to.equal(true);
    await expect(adapter.connect(reporter).reportCompletedJob(1, metadataHash)).to.be.revertedWithCustomError(adapter, "AlreadyReported");
  });

  it("enforces maximum job reward and open-job exposure", async function () {
    const system = await deploySystem();
    const { owner, developer, engine } = system;
    const developerAddress = await developer.getAddress();
    await prepareAgent(system);
    await fundAndApprove(system, ethers.parseEther("10"));
    await (await engine.setJobRiskLimits(ethers.parseEther("5"), 0, 1)).wait();
    await expect(engine.connect(developer).createJob(1, ethers.id("TASK_TOO_LARGE"), ethers.parseEther("6"))).to.be.revertedWithCustomError(engine, "JobRewardTooHigh");
    await (await engine.connect(developer).createJob(1, ethers.id("TASK_OK"), ethers.parseEther("4"))).wait();
    expect(await engine.openJobsByCreator(developerAddress)).to.equal(1n);
    await expect(engine.connect(developer).createJob(1, ethers.id("TASK_SECOND"), ethers.parseEther("1"))).to.be.revertedWithCustomError(engine, "TooManyOpenJobs");
    await (await engine.connect(owner).cancelJob(1)).wait();
    expect(await engine.openJobsByCreator(developerAddress)).to.equal(0n);
  });

  it("exposes a completion deadline when timeout protection is enabled", async function () {
    const system = await deploySystem();
    const { owner, developer, engine } = system;
    await prepareAgent(system);
    await fundAndApprove(system, ethers.parseEther("1"));
    await (await engine.setJobRiskLimits(0, 3600, 0)).wait();
    await (await engine.connect(developer).createJob(1, ethers.id("TASK_DEADLINE"), ethers.parseEther("1"))).wait();
    const job = await engine.jobs(1);
    expect(await engine.jobExecutionDeadline(1)).to.equal(job.createdAt + 3600n);
    await (await engine.connect(owner).assignJob(1)).wait();
  });
});
