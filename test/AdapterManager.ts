import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AdapterManager", function () {
  it("routes verification through an enabled registered adapter", async function () {
    const [owner, user] = await ethers.getSigners();
    const registry = await ethers.deployContract("ChainRegistry", [owner.address]);
    const adapter = await ethers.deployContract("EVMChainAdapter", [owner.address, 84532, ethers.id("EVM")]);
    const manager = await ethers.deployContract("AdapterManager", [owner.address, registry.target]);

    await registry.setAdapterAuthorized(adapter.target, true);
    await registry.registerChain(84532, ethers.id("BASE_SEPOLIA"), ethers.id("EVM"), adapter.target, true);
    await manager.setEnabled(84532, true);

    const activityId = ethers.id("BASE_ACTIVITY");
    await adapter.setActivityVerified(activityId, user.address, true);

    expect(await manager.verifyActivity(84532, activityId, user.address, "0x")).to.equal(true);
  });

  it("rejects disabled adapters", async function () {
    const [owner, user] = await ethers.getSigners();
    const registry = await ethers.deployContract("ChainRegistry", [owner.address]);
    const adapter = await ethers.deployContract("EVMChainAdapter", [owner.address, 11155111, ethers.id("EVM")]);
    const manager = await ethers.deployContract("AdapterManager", [owner.address, registry.target]);

    await registry.setAdapterAuthorized(adapter.target, true);
    await registry.registerChain(11155111, ethers.id("SEPOLIA"), ethers.id("EVM"), adapter.target, true);

    await expect(
      manager.verifyActivity(11155111, ethers.id("A"), user.address, "0x"),
    ).to.be.revertedWith("AdapterManager: adapter disabled");
  });
});
