import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("ActivityRegistry", function () {
  async function deploy() {
    const [owner, user, reporter] = await ethers.getSigners();
    const registry = await ethers.deployContract("ActivityRegistry", [owner.address]);
    const adapter = await ethers.deployContract("ActivityReporter", [owner.address, registry.target]);
    return { owner, user, reporter, registry, adapter };
  }

  it("registers supported activity types and records activity with its source chain", async function () {
    const { owner, user, registry } = await deploy();
    const swap = ethers.id("SWAP");
    const project = ethers.id("PROJECT_A");
    const metadata = ethers.id("METADATA_1");
    const sourceChain = 84532n;

    await registry.setActivityType(swap, true);
    await registry.recordActivity(user.address, sourceChain, swap, project, metadata, true);

    expect(await registry.totalActivities()).to.equal(1n);
    expect(await registry.activityCount(user.address)).to.equal(1n);

    const activity = await registry.getActivity(user.address, 0);
    expect(activity.chainId).to.equal(sourceChain);
    expect(activity.activityType).to.equal(swap);
    expect(activity.projectId).to.equal(project);
    expect(activity.metadataHash).to.equal(metadata);
    expect(activity.verified).to.equal(true);
    expect(await registry.owner()).to.equal(owner.address);
  });

  it("rejects unsupported activity types", async function () {
    const { user, registry } = await deploy();
    const swap = ethers.id("SWAP");

    await expect(
      registry.recordActivity(user.address, 84532n, swap, ethers.ZeroHash, ethers.ZeroHash, false),
    ).to.be.revertedWith("Activity: unsupported type");
  });

  it("accepts submissions only from authorized reporters", async function () {
    const { owner, user, reporter, registry, adapter } = await deploy();
    const bridge = ethers.id("BRIDGE");
    const sourceChain = 84532n;

    await registry.setActivityType(bridge, true);
    await adapter.setReporter(reporter.address, true);
    await adapter.setSupportedChain(reporter.address, sourceChain, true);

    await adapter.connect(reporter).submit(
      user.address,
      sourceChain,
      bridge,
      ethers.id("PROJECT_B"),
      ethers.id("METADATA_2"),
      true,
    );

    expect(await registry.activityCount(user.address)).to.equal(1n);
    expect((await registry.getActivity(user.address, 0)).chainId).to.equal(sourceChain);
    expect(await adapter.reporters(reporter.address)).to.equal(true);
    expect(await adapter.owner()).to.equal(owner.address);
  });
});
