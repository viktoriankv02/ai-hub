import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AICompletionReporter authorization", function () {
  it("allows an owner-approved execution caller to submit a completion", async function () {
    const [owner, developer, executor] = await ethers.getSigners();
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

    const activityType = ethers.id("AI_JOB_COMPLETED");
    await (await registry.setActivityType(activityType, true)).wait();
    await (await registry.setReporter(await reporter.getAddress(), true)).wait();
    await (await engine.setCompletionReporter(await reporter.getAddress(), true)).wait();
    await (await reporter.setAuthorizedCaller(await executor.getAddress(), true)).wait();

    await (await runtime.connect(developer).registerAgent("Worker", "endpoint", "metadata", "1.0.0")).wait();
    await (await runtime.setVerified(1, true)).wait();
    await (await runtime.connect(developer).startAgent(1)).wait();

    const reward = ethers.parseEther("1");
    await (await token.transfer(await developer.getAddress(), reward)).wait();
    await (await token.connect(developer).approve(await engine.getAddress(), reward)).wait();
    await (await engine.connect(developer).createJob(1, ethers.id("TASK_AUTH"), reward)).wait();
    await (await engine.assignJob(1)).wait();

    await (
      await reporter.connect(executor).submitVerifiedCompletion(
        1,
        ethers.id("RESULT_AUTH"),
        activityType,
        ethers.id("AI_HUB"),
        ethers.id("META_AUTH"),
        ethers.id("COMPLETION_AUTH"),
      )
    ).wait();

    expect((await engine.jobs(1)).completed).to.equal(true);
    expect(await registry.totalActivities()).to.equal(1n);
  });

  it("allows rotating an execution caller without changing engine reporter authorization", async function () {
    const [owner, oldExecutor, newExecutor] = await ethers.getSigners();
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

    expect(await reporter.authorizedCallers(await oldExecutor.getAddress())).to.equal(false);
    await (await reporter.setAuthorizedCaller(await oldExecutor.getAddress(), true)).wait();
    expect(await reporter.authorizedCallers(await oldExecutor.getAddress())).to.equal(true);

    await (await reporter.setAuthorizedCaller(await oldExecutor.getAddress(), false)).wait();
    await (await reporter.setAuthorizedCaller(await newExecutor.getAddress(), true)).wait();

    expect(await reporter.authorizedCallers(await oldExecutor.getAddress())).to.equal(false);
    expect(await reporter.authorizedCallers(await newExecutor.getAddress())).to.equal(true);
  });
});
