import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("EVMChainAdapter", function () {
  async function deployFixture() {
    const [owner, user] = await ethers.getSigners();
    const adapter = await ethers.deployContract("EVMChainAdapter", [
      owner.address,
      84532n,
      ethers.id("EVM"),
    ]);
    return { owner, user, adapter };
  }

  it("exposes immutable chain metadata", async function () {
    const { adapter } = await deployFixture();
    expect(await adapter.chainId()).to.equal(84532n);
    expect(await adapter.vmType()).to.equal(ethers.id("EVM"));
    expect(await adapter.isAvailable()).to.equal(true);
  });

  it("accepts an authorized verification and can revoke it", async function () {
    const { owner, user, adapter } = await deployFixture();
    const activityId = ethers.id("BASE_ACTIVITY_001");

    await adapter.setActivityVerified(activityId, user.address, true);
    expect(await adapter.verifyActivity(activityId, user.address, "0x1234")).to.equal(true);

    await adapter.setActivityVerified(activityId, user.address, false);
    expect(await adapter.verifyActivity(activityId, user.address, "0x1234")).to.equal(false);
    expect(await adapter.owner()).to.equal(owner.address);
  });

  it("stops verification while unavailable", async function () {
    const { user, adapter } = await deployFixture();
    const activityId = ethers.id("BASE_ACTIVITY_002");

    await adapter.setActivityVerified(activityId, user.address, true);
    await adapter.setAvailable(false);

    expect(await adapter.verifyActivity(activityId, user.address, "0xabcd")).to.equal(false);
  });
});
