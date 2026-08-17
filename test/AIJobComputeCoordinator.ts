import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AIJobComputeCoordinator", function () {
  async function deploySystem() {
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
    const nodes = await ethers.deployContract("AIComputeNodeRegistry", [
      await owner.getAddress(),
      await token.getAddress(),
      1n,
    ]);
    await nodes.waitForDeployment();
    const coordinator = await ethers.deployContract("AIJobComputeCoordinator", [
      await owner.getAddress(),
      await engine.getAddress(),
      await nodes.getAddress(),
    ]);
    await coordinator.waitForDeployment();

    await (await nodes.setController(await coordinator.getAddress(), true)).wait();
    await (await coordinator.setController(await controller.getAddress(), true)).wait();

    await (await runtime.connect(developer).registerAgent("Worker", "endpoint", "metadata", "1.0.0")).wait();
    await (await runtime.setVerified(1, true)).wait();
    await (await runtime.connect(developer).startAgent(1)).wait();

    const reward = ethers.parseEther("5");
    await (await token.transfer(await developer.getAddress(), reward)).wait();
    await (await token.connect(developer).approve(await engine.getAddress(), reward)).wait();
    await (await engine.connect(developer).createJob(1, ethers.id("COMPUTE_TASK"), reward)).wait();
    await (await engine.assignJob(1)).wait();

    await (await token.transfer(await developer.getAddress(), 1n)).wait();
    await (await token.connect(developer).approve(await nodes.getAddress(), 1n)).wait();
    await (await nodes.connect(developer).registerNode(
      "https://compute.example",
      "A100",
      80,
      32,
      128,
      "eu-west",
      1n,
    )).wait();

    return { owner, developer, controller, token, runtime, engine, nodes, coordinator };
  }

  it("binds a funded assigned job to an available compute node", async function () {
    const system = await deploySystem();
    const { controller, coordinator, nodes } = system;

    await (await coordinator.connect(controller).bindAndStart(1, 1)).wait();

    expect(await coordinator.nodeByJob(1)).to.equal(1n);
    expect(await coordinator.jobByNode(1)).to.equal(1n);
    expect((await nodes.getNode(1)).activeJobs).to.equal(1n);
    expect(await coordinator.executionActive(1)).to.equal(true);
  });

  it("completes the node execution and clears the node binding", async function () {
    const system = await deploySystem();
    const { controller, coordinator, nodes } = system;

    await (await coordinator.connect(controller).bindAndStart(1, 1)).wait();
    await (await coordinator.connect(controller).complete(1, 25n)).wait();

    const execution = await coordinator.getExecution(1);
    expect(execution.completed).to.equal(true);
    expect(execution.active).to.equal(false);
    expect(execution.computeReward).to.equal(25n);
    expect(await coordinator.jobByNode(1)).to.equal(0n);
    expect((await nodes.getNode(1)).completedJobs).to.equal(1n);
  });

  it("fails an execution without marking the job as completed", async function () {
    const system = await deploySystem();
    const { controller, coordinator, nodes } = system;

    await (await coordinator.connect(controller).bindAndStart(1, 1)).wait();
    await (await coordinator.connect(controller).fail(1)).wait();

    const execution = await coordinator.getExecution(1);
    expect(execution.failed).to.equal(true);
    expect(execution.active).to.equal(false);
    expect((await nodes.getNode(1)).failedJobs).to.equal(1n);
    expect(await coordinator.jobByNode(1)).to.equal(0n);
  });

  it("rejects binding a completed or already-bound job", async function () {
    const system = await deploySystem();
    const { controller, coordinator } = system;

    await (await coordinator.connect(controller).bindAndStart(1, 1)).wait();
    await expect(coordinator.connect(controller).bindAndStart(1, 1))
      .to.be.revertedWithCustomError(coordinator, "JobAlreadyBound");
  });
});
