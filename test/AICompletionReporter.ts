import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AICompletionReporter", function () {
  async function deploySystem() {
    const [owner, developer, attacker] = await ethers.getSigners();
    const ownerAddress = await owner.getAddress();

    const token = await ethers.deployContract("MockRewardToken");
    await token.waitForDeployment();
    const runtime = await ethers.deployContract("AIAgentRuntime", [ownerAddress]);
    await runtime.waitForDeployment();
    const engine = await ethers.deployContract("AIAgentEngine", [ownerAddress, await runtime.getAddress(), await token.getAddress()]);
    await engine.waitForDeployment();
    const registry = await ethers.deployContract("ActivityRegistry", [ownerAddress]);
    await registry.waitForDeployment();
    const reporter = await ethers.deployContract("AICompletionReporter", [ownerAddress, await engine.getAddress(), await registry.getAddress()]);
    await reporter.waitForDeployment();

    await (await registry.setActivityType(ethers.id("AI_JOB_COMPLETED"), true)).wait();
    await (await registry.setReporter(await reporter.getAddress(), true)).wait();
    await (await engine.setCompletionReporter(await reporter.getAddress(), true)).wait();
    await (await reporter.setCompletionCaller(await owner.getAddress(), true)).wait();

    return { owner, developer, attacker, token, runtime, engine, registry, reporter };
  }

  async function createAssignedJob(system: Awaited<ReturnType<typeof deploySystem>>) {
    const { owner, developer, token, runtime, engine } = system;
    const developerAddress = await developer.getAddress();
    await (await runtime.connect(developer).registerAgent("Worker", "endpoint", "metadata", "1.0.0")).wait();
    await (await runtime.connect(owner).setVerified(1, true)).wait();
    await (await runtime.connect(developer).startAgent(1)).wait();
    const reward = ethers.parseEther("10");
    await (await token.transfer(developerAddress, reward)).wait();
    await (await token.connect(developer).approve(await engine.getAddress(), reward)).wait();
    await (await engine.connect(developer).createJob(1, ethers.id("TASK_REPORTER"), reward)).wait();
    await (await engine.connect(owner).assignJob(1)).wait();
  }

  it("atomically completes a job and records verified activity", async function () {
    const system = await deploySystem();
    await createAssignedJob(system);
    const { owner, developer, engine, registry, reporter } = system;
    const developerAddress = await developer.getAddress();

    const activityId = await reporter.connect(owner).submitVerifiedCompletion.staticCall(
      1,
      ethers.id("RESULT_REPORTER"),
      ethers.id("AI_JOB_COMPLETED"),
      ethers.id("AI_HUB_JOB_PIPELINE"),
      ethers.id("META_REPORTER"),
      ethers.id("COMPLETION_001"),
    );
    expect(activityId).to.equal(1n);

    await (await reporter.connect(owner).submitVerifiedCompletion(
      1,
      ethers.id("RESULT_REPORTER"),
      ethers.id("AI_JOB_COMPLETED"),
      ethers.id("AI_HUB_JOB_PIPELINE"),
      ethers.id("META_REPORTER"),
      ethers.id("COMPLETION_001"),
    )).wait();

    const completed = await engine.jobs(1);
    expect(completed.completed).to.equal(true);
    expect(completed.resultHash).to.equal(ethers.id("RESULT_REPORTER"));
    expect(await registry.totalActivities()).to.equal(1n);
    expect(await registry.activityCount(developerAddress)).to.equal(1n);
  });

  it("rejects an unauthorized caller", async function () {
    const system = await deploySystem();
    await createAssignedJob(system);
    const { attacker, reporter } = system;

    await expect(reporter.connect(attacker).submitVerifiedCompletion(
      1,
      ethers.id("RESULT_ATTACK"),
      ethers.id("AI_JOB_COMPLETED"),
      ethers.id("AI_HUB_JOB_PIPELINE"),
      ethers.id("META_ATTACK"),
      ethers.id("COMPLETION_ATTACK"),
    )).to.be.revertedWithCustomError(reporter, "UnauthorizedCaller");
  });

  it("rejects replay of the same completion id", async function () {
    const system = await deploySystem();
    await createAssignedJob(system);
    const { owner, reporter } = system;
    const args = [1, ethers.id("RESULT_REPLAY"), ethers.id("AI_JOB_COMPLETED"), ethers.id("AI_HUB_JOB_PIPELINE"), ethers.id("META_REPLAY"), ethers.id("COMPLETION_REPLAY")] as const;

    await (await reporter.connect(owner).submitVerifiedCompletion(...args)).wait();
    await expect(reporter.connect(owner).submitVerifiedCompletion(...args)).to.be.revertedWithCustomError(reporter, "CompletionAlreadySubmitted");
  });
});
