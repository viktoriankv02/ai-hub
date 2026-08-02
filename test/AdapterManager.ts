import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AdapterManager", function () {
  it("routes verification through an enabled registered adapter", async function () {
    const [owner, user] = await ethers.getSigners();
    const registry = await ethers.deployContract("ChainRegistry", [owner.address]);
    const adapter = await ethers.deployContract("EVMChainAdapter", [owner.address, 84532n, ethers.id("EVM")]);
    const manager = await ethers.deployContract("AdapterManager", [owner.address, registry.target]);

    await registry.setAdapterAuthorized(adapter.target, true);
    await registry.registerChain(84532n, ethers.id("BASE_SEPOLIA"), ethers.id("EVM"), adapter.target, true, true);
    await manager.setEnabled(84532n, true);

    const activityId = ethers.id("BASE_ACTIVITY");
    await adapter.setActivityVerified(activityId, user.address, true);

    expect(await manager.verifyActivity(84532n, activityId, user.address, "0x")).to.equal(true);
  });

  it("rejects disabled adapters", async function () {
    const [owner, user] = await ethers.getSigners();
    const registry = await ethers.deployContract("ChainRegistry", [owner.address]);
    const adapter = await ethers.deployContract("EVMChainAdapter", [owner.address, 11155111n, ethers.id("EVM")]);
    const manager = await ethers.deployContract("AdapterManager", [owner.address, registry.target]);

    await registry.setAdapterAuthorized(adapter.target, true);
    await registry.registerChain(11155111n, ethers.id("SEPOLIA"), ethers.id("EVM"), adapter.target, true, true);

    await expect(manager.verifyActivity(11155111n, ethers.id("A"), user.address, "0x"))
      .to.be.revertedWith("AdapterManager: adapter disabled");
  });
});
