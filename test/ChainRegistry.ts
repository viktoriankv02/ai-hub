import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("ChainRegistry", function () {
  it("registers an authorized EVM adapter", async function () {
    const [owner] = await ethers.getSigners();
    const registry = await ethers.deployContract("ChainRegistry", [owner.address]);
    const adapter = await ethers.deployContract("EVMChainAdapter", [
      owner.address,
      84532,
      ethers.id("EVM"),
    ]);

    await registry.setAdapterAuthorized(adapter.target, true);
    await registry.registerChain(
      84532,
      ethers.id("BASE_SEPOLIA"),
      ethers.id("EVM"),
      adapter.target,
      true,
    );

    const chain = await registry.getChain(84532);
    expect(chain.chainId).to.equal(84532n);
    expect(chain.adapter).to.equal(adapter.target);
    expect(chain.active).to.equal(true);
    expect(await registry.isSupported(84532)).to.equal(true);
  });

  it("verifies activity through an EVM adapter", async function () {
    const [owner, user] = await ethers.getSigners();
    const adapter = await ethers.deployContract("EVMChainAdapter", [
      owner.address,
      11155111,
      ethers.id("EVM"),
    ]);

    const activityId = ethers.id("ACTIVITY_001");
    expect(await adapter.verifyActivity(activityId, user.address, "0x")).to.equal(false);

    await adapter.setActivityVerified(activityId, user.address, true);
    expect(await adapter.verifyActivity(activityId, user.address, "0x")).to.equal(true);

    await adapter.setActivityVerified(activityId, user.address, false);
    expect(await adapter.verifyActivity(activityId, user.address, "0x")).to.equal(false);
  });
});
