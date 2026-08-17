import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AIComputeNodeRegistry", function () {
  async function deploySystem() {
    const [owner, nodeOwner, controller, stranger] = await ethers.getSigners();
    const token = await ethers.deployContract("MockRewardToken");
    await token.waitForDeployment();
    const registry = await ethers.deployContract("AIComputeNodeRegistry", [owner.address, await token.getAddress(), ethers.parseEther("100")]);
    await registry.waitForDeployment();
    await (await registry.setJobController(controller.address, true)).wait();
    return { owner, nodeOwner, controller, stranger, token, registry };
  }

  async function registerNode(system: Awaited<ReturnType<typeof deploySystem>>, stake = ethers.parseEther("100")) {
    const { nodeOwner, token, registry } = system;
    await (await token.transfer(nodeOwner.address, stake)).wait();
    await (await token.connect(nodeOwner).approve(await registry.getAddress(), stake)).wait();
    await (await registry.connect(nodeOwner).registerNode(
      "GPU-01", "RTX 4090", 24, 16, 64, "EU", stake,
    )).wait();
  }

  it("registers a staked online node", async function () {
    const system = await deploySystem();
    await registerNode(system);
    const { registry, nodeOwner } = system;
    const node = await registry.getNode(1);
    expect(node.owner).to.equal(nodeOwner.address);
    expect(node.stake).to.equal(ethers.parseEther("100"));
    expect(node.status).to.equal(1n);
    expect(node.reputation).to.equal(100n);
    expect(await registry.isHealthy(1)).to.equal(true);
  });

  it("requires minimum stake", async function () {
    const system = await deploySystem();
    const { nodeOwner, token, registry } = system;
    await (await token.transfer(nodeOwner.address, ethers.parseEther("99"))).wait();
    await (await token.connect(nodeOwner).approve(await registry.getAddress(), ethers.parseEther("99"))).wait();
    await expect(registry.connect(nodeOwner).registerNode(
      "Weak", "GPU", 8, 8, 16, "EU", ethers.parseEther("99"),
    )).to.be.revertedWithCustomError(registry, "InvalidStake");
  });

  it("allows an authorized controller to start and finish jobs", async function () {
    const system = await deploySystem();
    await registerNode(system);
    const { controller, registry } = system;
    await (await registry.connect(controller).markBusy(1)).wait();
    expect((await registry.getNode(1)).activeJobs).to.equal(1n);
    expect((await registry.getNode(1)).status).to.equal(2n);
    await (await registry.connect(controller).finishJob(1, ethers.parseEther("5"), true)).wait();
    const node = await registry.getNode(1);
    expect(node.activeJobs).to.equal(0n);
    expect(node.completedJobs).to.equal(1n);
    expect(node.totalRewards).to.equal(ethers.parseEther("5"));
    expect(node.reputation).to.equal(101n);
    expect(node.status).to.equal(1n);
  });

  it("reduces reputation on failure", async function () {
    const system = await deploySystem();
    await registerNode(system);
    const { controller, registry } = system;
    await (await registry.connect(controller).markBusy(1)).wait();
    await (await registry.connect(controller).finishJob(1, 0, false)).wait();
    const node = await registry.getNode(1);
    expect(node.failedJobs).to.equal(1n);
    expect(node.reputation).to.equal(95n);
  });

  it("rejects job control from unauthorized accounts", async function () {
    const system = await deploySystem();
    await registerNode(system);
    const { stranger, registry } = system;
    await expect(registry.connect(stranger).markBusy(1)).to.be.revertedWithCustomError(registry, "UnauthorizedController");
  });

  it("restores an offline node on heartbeat and rejects expired nodes for scheduling", async function () {
    const system = await deploySystem();
    await registerNode(system);
    const { nodeOwner, controller, registry } = system;
    await (await registry.setRegistryParameters(ethers.parseEther("100"), 60)).wait();
    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);
    expect(await registry.isHealthy(1)).to.equal(false);
    await expect(registry.connect(controller).markBusy(1)).to.be.revertedWithCustomError(registry, "HeartbeatExpired");
    await (await registry.connect(nodeOwner).heartbeat(1)).wait();
    expect(await registry.isHealthy(1)).to.equal(true);
    await (await registry.connect(controller).markBusy(1)).wait();
  });

  it("prevents stake withdrawal while jobs are active and allows it after completion", async function () {
    const system = await deploySystem();
    await registerNode(system);
    const { nodeOwner, controller, registry, token } = system;
    await (await registry.connect(controller).markBusy(1)).wait();
    await expect(registry.connect(nodeOwner).withdrawStake(1)).to.be.revertedWithCustomError(registry, "StakeLocked");
    await (await registry.connect(controller).finishJob(1, 0, true)).wait();
    const before = await token.balanceOf(nodeOwner.address);
    await (await registry.connect(nodeOwner).withdrawStake(1)).wait();
    const after = await token.balanceOf(nodeOwner.address);
    expect(after - before).to.equal(ethers.parseEther("100"));
    expect((await registry.getNode(1)).status).to.equal(3n);
  });

  it("slashes stake and can disable a node below the minimum", async function () {
    const system = await deploySystem();
    await registerNode(system);
    const { owner, registry, nodeOwner, token } = system;
    const receiverBefore = await token.balanceOf(owner.address);
    await (await registry.connect(owner).slash(1, ethers.parseEther("10"), owner.address)).wait();
    const receiverAfter = await token.balanceOf(owner.address);
    expect(receiverAfter - receiverBefore).to.equal(ethers.parseEther("10"));
    expect((await registry.getNode(1)).stake).to.equal(ethers.parseEther("90"));
    await (await registry.connect(nodeOwner).disableNode(1)).wait();
    expect((await registry.getNode(1)).status).to.equal(3n);
  });
});
