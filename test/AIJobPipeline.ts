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

    const engine = await ethers.deployContract("AIAgentEngine", [
      ownerAddress,
      await runtime.getAddress(),
      await token.getAddress(),
    ]);
    await engine.waitForDeployment();

    const registry = await ethers.deployContract("ActivityRegistry", [ownerAddress]);
    await registry.waitForDeployment();

    const adapter = await ethers.deployContract("AIJobActivityAdapter", [
      ownerAddress,
      await engine.getAddress(),
      await runtime.getAddress(),
      await registry.getAddress(),
      INK_SEPOLIA,
      ethers.id("AI_JOB_COMPLETED"),
      ethers.id("AI_HUB_JOB_PIPELINE"),
    ]);
    await adapter.waitForDeployment();

    await (await registry.setActivityType(ethers.id("AI_JOB_COMPLETED"), true)).wait();
    await (await registry.setReporter(await adapter.getAddress(), true)).wait();
    await (await engine.setCompletionReporter(await reporter.getAddress(), true)).wait();
    await (await engine.setPayoutManager(await owner.getAddress(), true)).wait();

    return { owner, developer, reporter, token, runtime, engine, registry, adapter };
  }

  it("registers, verifies and starts an agent", async function () {
    const { owner, developer, runtime } = await deploySystem();
    const developerAddress = await developer.getAddress();

    await (
      await runtime.connect(developer).registerAgent(
        "Ink Worker",
        "https://agent.example/execute",
        "ipfs://agent-metadata",
        "0.1.0",
      )
    ).wait();

    const agent = await runtime.getAgent(1);
    expect(agent.owner).to.equal(developerAddress);
    expect(agent.verified).to.equal(false);

    await (await runtime.connect(owner).setVerified(1, true)).wait();
    await (await runtime.connect(developer).startAgent(1)).wait();

    expect(await runtime.canExecute(1)).to.equal(true);
  });

  it("creates, assigns and completes a funded AI job", async function () {
    const { owner, developer, reporter, token, runtime, engine } = await deploySystem();
    const developerAddress = await developer.getAddress();
    const reporterAddress = await reporter.getAddress();

    await (await runtime.connect(developer).registerAgent("Worker", "endpoint", "metadata", "1.0.0")).wait();
    await (await runtime.connect(owner).setVerified(1, true)).wait();
    await (await runtime.connect(developer).startAgent(1)).wait();

    const reward = ethers.parseEther("100");
    await (await token.transfer(developerAddress, reward)).wait();
    await (await token.connect(developer).approve(await engine.getAddress(), reward)).wait();
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
    expect(reporterAddress).to.not.equal(developerAddress);
  });

  it("bridges a completed job into ActivityRegistry exactly once", async function () {
    const { owner, developer, reporter, token, runtime, engine, registry, adapter } = await deploySystem();
    const developerAddress = await developer.getAddress();

    await (await runtime.connect(developer).registerAgent("Worker", "endpoint", "metadata", "1.0.0")).wait();
    await (await runtime.connect(owner).setVerified(1, true)).wait();
    await (await runtime.connect(developer).startAgent(1)).wait();

    const reward = ethers.parseEther("10");
    await (await token.connect(developer).approve(await engine.getAddress(), reward)).wait();
    await (await engine.connect(developer).createJob(1, ethers.id("TASK_002"), reward)).wait();
    await (await engine.connect(owner).assignJob(1)).wait();
    await (await engine.connect(reporter).completeJob(1, ethers.id("RESULT_002"))).wait();

    await (await adapter.connect(reporter).setReporter(await reporter.getAddress(), true)).wait();
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

    await expect(adapter.connect(reporter).reportCompletedJob(1, metadataHash)).to.be.revertedWithCustomError(
      adapter,
      "AlreadyReported",
    );
  });
});
