import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("ActivityReporter", function () {
  async function deployFixture() {
    const [owner, reporter, user] = await ethers.getSigners();
    const registry = await ethers.deployContract("ActivityRegistry", [owner.address]);
    const activityType = ethers.id("SWAP");
    const projectId = ethers.id("DEMO_PROJECT");
    await registry.setActivityType(activityType, true);
    const gateway = await ethers.deployContract("ActivityReporter", [owner.address, registry.target]);
    await gateway.setReporter(reporter.address, true);
    return { owner, reporter, user, registry, gateway, activityType, projectId };
  }

  it("allows an authorized reporter on a supported chain", async function () {
    const { reporter, user, registry, gateway, activityType, projectId } = await deployFixture();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    await gateway.setSupportedChain(reporter.address, chainId, true);

    await gateway.connect(reporter).submit(
      user.address,
      chainId,
      activityType,
      projectId,
      ethers.id("META_001"),
      true,
    );

    expect(await registry.activityCount(user.address)).to.equal(1n);
    expect((await registry.getActivity(user.address, 0)).verified).to.equal(true);
  });

  it("rejects an unauthorized reporter", async function () {
    const { user, gateway, activityType, projectId } = await deployFixture();
    const chainId = (await ethers.provider.getNetwork()).chainId;

    await expect(
      gateway.connect(user).submit(
        user.address,
        chainId,
        activityType,
        projectId,
        ethers.id("META_002"),
        true,
      ),
    ).to.be.revertedWith("Reporter: unauthorized");
  });

  it("rejects a reporter that is not enabled for the chain", async function () {
    const { reporter, user, gateway, activityType, projectId } = await deployFixture();
    const chainId = (await ethers.provider.getNetwork()).chainId;

    await expect(
      gateway.connect(reporter).submit(
        user.address,
        chainId,
        activityType,
        projectId,
        ethers.id("META_003"),
        true,
      ),
    ).to.be.revertedWith("Reporter: unsupported chain");
  });
});
