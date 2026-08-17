import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AI orchestration controllers", function () {
  it("allows a trusted controller to operate an agent without becoming its owner", async function () {
    const [owner, developer, controller, other] = await ethers.getSigners();
    const runtime = await ethers.deployContract("AIAgentRuntime", [await owner.getAddress()]);
    await runtime.waitForDeployment();

    await (await runtime.connect(developer).registerAgent("Worker", "endpoint", "metadata", "1.0.0")).wait();
    await (await runtime.setController(await controller.getAddress(), true)).wait();
    await (await runtime.connect(controller).startAgent(1)).wait();
    await (await runtime.connect(controller).heartbeat(1)).wait();
    await (await runtime.connect(controller).pauseAgent(1)).wait();

    expect(await runtime.controllers(await controller.getAddress())).to.equal(true);
    expect(await runtime.agentStatus(1)).to.equal(2n);
    await expect(runtime.connect(other).startAgent(1))
      .to.be.revertedWithCustomError(runtime, "NotAgentOwner");
  });

  it("allows a controller to assign jobs while preserving owner compatibility", async function () {
    const [owner, developer, controller] = await ethers.getSigners();
    const token = await ethers.deployContract("MockRewardToken");
    await token.waitForDeployment();
    const runtime = await ethers.deployContract("AIAgentRuntime", [await owner.getAddress()]);
    await runtime.waitForDeployment();
    const engine = await ethers.deployContract("AIAgentEngine", [
      await owner.getAddress(),
      await runtime.getAddress(),
      await token.getAddress(),
    ]);
    await engine.waitForDeployment();

    await (await runtime.connect(developer).registerAgent("Worker", "endpoint", "metadata", "1.0.0")).wait();
    await (await runtime.setVerified(1, true)).wait();
    await (await runtime.connect(developer).startAgent(1)).wait();
    await (await engine.setController(await controller.getAddress(), true)).wait();

    const reward = ethers.parseEther("1");
    await (await token.transfer(await developer.getAddress(), reward)).wait();
    await (await token.connect(developer).approve(await engine.getAddress(), reward)).wait();
    await (await engine.connect(developer).createJob(1, ethers.id("CONTROLLER_TASK"), reward)).wait();
    await (await engine.connect(controller).assignJob(1)).wait();

    expect((await engine.jobs(1)).assigned).to.equal(true);
  });
});
