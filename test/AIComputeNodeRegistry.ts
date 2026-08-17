import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AIComputeNodeRegistry", function () {
  async function deploySystem() {
    const [owner, nodeOwner, controller, other] = await ethers.getSigners();
    const token = await ethers.deployContract("MockRewardToken");
    await token.waitForDeployment();
    const minimumStake = ethers.parseEther("100");
    const registry = await ethers.deployContract("AIComputeNodeRegistry", [
      await owner.getAddress(),
      await token.getAddress(),
      minimumStake,
    ]);
    await registry.waitForDeployment();
    await (await registry.setController(await controller.getAddress(), true)).wait();
    return { owner, nodeOwner, controller, other, token, registry, minimumStake };
  }

  async function registerNode(system: Awaited<ReturnType<typeof deploySystem>>) {
    const { nodeOwner, token, registry, minimumStake } = system;
    await (await token.transfer(await nodeOwner.getAddress(), minimumStake)).wait();
    await (await token.connect(nodeOwner).approve(await registry.getAddress(), minimumStake)).wait();
    await (await registry.connect(nodeOwner).registerNode(
      "https://node.example",
      "RTX 5090",
      32,
      16,
      64,
      "eu-central",
      minimumStake,
    )).wait();
  }

  it("registers a staked online node and records ownership", async function () {
    const system = await deploySystem();
    await registerNode(system);

    const { nodeOwner, registry, minimumStake } = system;
    const node = await registry.getNode(1);

    expect(node.owner).to.equal(await nodeOwner.getAddress());
    expect(node.stake).to.equal(minimumStake);
    expect(node.status).to.equal(1n);
    expect(node.reputation).to.equal(100n);
    expect(await registry.ownerNodes(await nodeOwner.getAddress())).to.deep.equal([1n]);
  });

  it("lets a controller start, finish and fail node jobs", async function () {
    const system = await deploySystem();
    await registerNode(system);

    const { controller, registry } = system;
    await (await registry.connect(controller).startJob(41, 1)).wait();
    expect((await registry.getNode(1)).status).to.equal(2n);
    expect(await registry.activeJobByNode(1)).to.equal(41n);

    await (await registry.connect(controller).finishJob(41, 1, 7n)).wait();
    let node = await registry.getNode(1);
    expect(node.status).to.equal(1n);
    expect(node.completedJobs).to.equal(1n);
    expect(node.totalReward).to.equal(7n);
    expect(node.reputation).to.equal(101n);

    await (await registry.connect(controller).startJob(42, 1)).wait();
    await (await registry.connect(controller).failJob(42, 1)).wait();
    node = await registry.getNode(1);
    expect(node.failedJobs).to.equal(1n);
    expect(node.reputation).to.equal(100n);
  });

  it("prevents non-controllers from mutating job state", async function () {
    const system = await deploySystem();
    await registerNode(system);

    const { other, registry } = system;
    await expect(registry.connect(other).startJob(1, 1))
      .to.be.revertedWithCustomError(registry, "NotController");
  });

  it("requires a disabled node before stake withdrawal", async function () {
    const system = await deploySystem();
    await registerNode(system);

    const { nodeOwner, registry, minimumStake } = system;
    await expect(registry.connect(nodeOwner).withdrawStake(1))
      .to.be.revertedWithCustomError(registry, "InvalidNodeState");

    await (await registry.connect(nodeOwner).disableNode(1)).wait();
    await (await registry.connect(nodeOwner).withdrawStake(1)).wait();

    expect((await registry.getNode(1)).stake).to.equal(0n);
    expect(await system.token.balanceOf(await nodeOwner.getAddress())).to.equal(minimumStake);
  });
});
