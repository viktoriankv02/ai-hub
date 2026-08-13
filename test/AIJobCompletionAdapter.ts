import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

const INK_SEPOLIA = 763373n;

describe("AIJobCompletionAdapter", function () {
  async function deploySystem() {
    const [owner, developer, attestor] = await ethers.getSigners();
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

    const chainRegistry = await ethers.deployContract("ChainRegistry", [ownerAddress]);
    await chainRegistry.waitForDeployment();

    const reporter = await ethers.deployContract("ActivityReporter", [
      ownerAddress,
      await registry.getAddress(),
      await chainRegistry.getAddress(),
    ]);
    await reporter.waitForDeployment();

    const activityType = ethers.id("AI_JOB_COMPLETED");
    const projectId = ethers.id("AI_HUB_JOB_PIPELINE");

    const adapter = await ethers.deployContract("AIJobCompletionAdapter", [
      ownerAddress,
      await engine.getAddress(),
      await reporter.getAddress(),
      INK_SEPOLIA,
      activityType,
      projectId,
    ]);
    await adapter.waitForDeployment();

    await (await registry.setActivityType(activityType, true)).wait();
    await (await chainRegistry.registerChain(INK_SEPOLIA, ethers.id("INK_SEPOLIA"), ethers.id("INK"), ethers.ZeroAddress, true)).wait();
    await (await reporter.setReporter(await adapter.getAddress(), true)).wait();
    await (await reporter.setSupportedChain(await adapter.getAddress(), INK_SEPOLIA, true)).wait();
    await (await engine.setCompletionReporter(await adapter.getAddress(), true)).wait();
    await (await adapter.setCompletionCaller(await attestor.getAddress(), true)).wait();

    return { owner, developer, attestor, token, runtime, engine, registry, reporter, adapter, activityType, projectId };
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
    await (await engine.connect(developer).createJob(1, ethers.id("TASK_ATOMIC"), reward)).wait();
    await (await engine.connect(owner).assignJob(1)).wait();
  }

  it("atomically completes the job and records a verified activity", async function () {
    const system = await deploySystem();
    await createAssignedJob(system);

    const { developer, attestor, engine, registry, adapter, activityType, projectId } = system;
    const developerAddress = await developer.getAddress();
    const resultHash = ethers.id("RESULT_ATOMIC");
    const metadataHash = ethers.id("ATTESTATION_001");

    await expect(adapter.connect(attestor).bridgeCompletion(1, resultHash, metadataHash))
      .to.emit(adapter, "JobCompletionBridged");

    const job = await engine.jobs(1);
    expect(job.completed).to.equal(true);
    expect(job.resultHash).to.equal(resultHash);
    expect(await adapter.reportedJobs(1)).to.equal(true);

    expect(await registry.totalActivities()).to.equal(1n);
    const activity = await registry.getActivity(developerAddress, 0);
    expect(activity.chainId).to.equal(INK_SEPOLIA);
    expect(activity.activityType).to.equal(activityType);
    expect(activity.projectId).to.equal(projectId);
    expect(activity.metadataHash).to.equal(metadataHash);
    expect(activity.verified).to.equal(true);
  });

  it("rejects an untrusted completion caller", async function () {
    const system = await deploySystem();
    await createAssignedJob(system);

    const { developer, engine, adapter } = system;
    const stranger = developer;

    await expect(
      adapter.connect(stranger).bridgeCompletion(1, ethers.id("RESULT"), ethers.id("META")),
    ).to.be.revertedWithCustomError(adapter, "UnauthorizedCaller");

    expect((await engine.jobs(1)).completed).to.equal(false);
  });

  it("is replay-safe and does not create duplicate activities", async function () {
    const system = await deploySystem();
    await createAssignedJob(system);

    const { attestor, registry, adapter } = system;
    const resultHash = ethers.id("RESULT_REPLAY");
    const metadataHash = ethers.id("META_REPLAY");

    await (await adapter.connect(attestor).bridgeCompletion(1, resultHash, metadataHash)).wait();

    await expect(
      adapter.connect(attestor).bridgeCompletion(1, resultHash, metadataHash),
    ).to.be.revertedWithCustomError(adapter, "AlreadyReported");

    expect(await registry.totalActivities()).to.equal(1n);
  });

  it("rolls back completion when the activity boundary rejects the submission", async function () {
    const system = await deploySystem();
    await createAssignedJob(system);

    const { attestor, engine, registry, adapter } = system;
    const unsupportedActivity = ethers.id("UNSUPPORTED_ACTIVITY");

    // The immutable adapter uses AI_JOB_COMPLETED, so disabling that type is the
    // cleanest way to force the downstream ActivityReporter to revert.
    await (await registry.setActivityType(ethers.id("AI_JOB_COMPLETED"), false)).wait();

    await expect(
      adapter.connect(attestor).bridgeCompletion(1, ethers.id("RESULT_ROLLBACK"), ethers.id("META")),
    ).to.be.reverted;

    expect((await engine.jobs(1)).completed).to.equal(false);
    expect(await adapter.reportedJobs(1)).to.equal(false);
    expect(unsupportedActivity).to.not.equal(ethers.id("AI_JOB_COMPLETED"));
  });
});
