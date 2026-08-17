import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AIJobGateway", function () {
  it("creates a funded job without changing the user creator", async function () {
    const [owner, user] = await ethers.getSigners();
    const token = await ethers.deployContract("MockRewardToken");
    await token.waitForDeployment();
    const runtime = await ethers.deployContract("AIAgentRuntime", [owner.address]);
    await runtime.waitForDeployment();
    const engine = await ethers.deployContract("AIAgentEngine", [owner.address, await runtime.getAddress(), await token.getAddress()]);
    await engine.waitForDeployment();
    const gateway = await ethers.deployContract("AIJobGateway", [owner.address, await engine.getAddress()]);
    await gateway.waitForDeployment();

    await (await runtime.connect(user).registerAgent("Worker", "endpoint", "metadata", "1.0.0")).wait();
    await (await runtime.connect(owner).setVerified(1, true)).wait();
    await (await runtime.connect(user).startAgent(1)).wait();

    const reward = ethers.parseEther("25");
    await (await token.transfer(user.address, reward)).wait();
    await (await token.connect(user).approve(await engine.getAddress(), reward)).wait();
    await (await engine.setJobGateway(await gateway.getAddress(), true)).wait();

    const taskHash = ethers.id("BASE_GATEWAY_TASK");
    await (await gateway.connect(user).createRequest(1, taskHash, reward)).wait();

    const job = await engine.jobs(1);
    expect(job.creator).to.equal(user.address);
    expect(job.agentId).to.equal(1n);
    expect(job.reward).to.equal(reward);
    expect(job.taskHash).to.equal(taskHash);

    const request = await gateway.getRequest(1);
    expect(request.user).to.equal(user.address);
    expect(request.jobId).to.equal(1n);
    expect(request.processed).to.equal(true);
  });

  it("cannot create jobs until explicitly authorized by the engine owner", async function () {
    const [owner, user] = await ethers.getSigners();
    const token = await ethers.deployContract("MockRewardToken");
    await token.waitForDeployment();
    const runtime = await ethers.deployContract("AIAgentRuntime", [owner.address]);
    await runtime.waitForDeployment();
    const engine = await ethers.deployContract("AIAgentEngine", [owner.address, await runtime.getAddress(), await token.getAddress()]);
    await engine.waitForDeployment();
    const gateway = await ethers.deployContract("AIJobGateway", [owner.address, await engine.getAddress()]);
    await gateway.waitForDeployment();

    await (await runtime.connect(user).registerAgent("Worker", "endpoint", "metadata", "1.0.0")).wait();
    await (await runtime.connect(owner).setVerified(1, true)).wait();
    await (await runtime.connect(user).startAgent(1)).wait();

    const reward = ethers.parseEther("1");
    await (await token.transfer(user.address, reward)).wait();
    await (await token.connect(user).approve(await engine.getAddress(), reward)).wait();

    await expect(gateway.connect(user).createRequest(1, ethers.id("TASK"), reward))
      .to.be.revertedWithCustomError(engine, "UnauthorizedGateway");
  });
});
