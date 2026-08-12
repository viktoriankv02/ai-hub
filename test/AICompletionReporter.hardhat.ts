import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AICompletionReporter hardhat smoke", function () {
  it("records the current chain id when completing a job", async function () {
    const [owner, developer] = await ethers.getSigners();
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

    await (await runtime.connect(developer).registerAgent("Worker", "endpoint", "metadata", "1.0.0")).wait();
    await (await runtime.setVerified(1, true)).wait();
    await (await runtime.connect(developer).startAgent(1)).wait();

    const reward = ethers.parseEther("1");
    await (await token.transfer(await developer.getAddress(), reward)).wait();
    await (await token.connect(developer).approve(await engine.getAddress(), reward)).wait();
    await (await engine.connect(developer).createJob(1, ethers.id("TASK_CHAIN"), reward)).wait();
    await (await engine.assignJob(1)).wait();

    await (await reporter.submitVerifiedCompletion(1, ethers.id("RESULT_CHAIN"), activityType, ethers.id("AI_HUB"), ethers.id("META_CHAIN"), ethers.id("COMPLETION_CHAIN"))).wait();

    const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
    expect(await registry.getActivity(await developer.getAddress(), 0)).to.include({ chainId, verified: true });
  });
});
