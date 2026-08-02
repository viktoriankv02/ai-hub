import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("SuiChainAdapter", function () {
  it("supports Sui testnet and verifies activity", async function () {
    const [owner, user] = await ethers.getSigners();
    const adapter = await ethers.deployContract("SuiChainAdapter", [owner.address, 102]);

    expect(await adapter.chainId()).to.equal(102n);
    expect(await adapter.vmType()).to.equal(ethers.id("SUI"));
    expect(await adapter.isAvailable()).to.equal(true);

    const activityId = ethers.id("SUI_ACTIVITY_001");
    expect(await adapter.verifyActivity(activityId, user.address, "0x")).to.equal(false);

    await adapter.setActivityVerified(activityId, user.address, true);
    expect(await adapter.verifyActivity(activityId, user.address, "0x")).to.equal(true);
  });

  it("rejects unsupported Sui chain IDs", async function () {
    const [owner] = await ethers.getSigners();
    await expect(
      ethers.deployContract("SuiChainAdapter", [owner.address, 84532]),
    ).to.be.revertedWith("SuiAdapter: unsupported chain");
  });
});
