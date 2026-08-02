import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AI Hub end-to-end smoke", function () {
  it("records a verified Base Sepolia activity", async function () {
    const [owner, reporter, user] = await ethers.getSigners();

    const activityRegistry = await ethers.deployContract("ActivityRegistry", [owner.address]);
    const chainRegistry = await ethers.deployContract("ChainRegistry", [owner.address]);
    const activityReporter = await ethers.deployContract("ActivityReporter", [owner.address, activityRegistry.target, chainRegistry.target]);
    const adapter = await ethers.deployContract("EVMChainAdapter", [owner.address, 84532n, ethers.id("EVM")]);

    const activityType = ethers.id("SWAP");
    const projectId = ethers.id("AI_HUB_SMOKE_TEST");
    const sourceActivityId = ethers.id("BASE_SEPOLIA_SMOKE_001");

    await activityRegistry.setActivityType(activityType, true);
    await activityRegistry.setReporter(activityReporter.target, true);
    await chainRegistry.setAdapterAuthorized(adapter.target, true);
    await chainRegistry.registerChain(84532n, ethers.id("BASE_SEPOLIA"), ethers.id("EVM"), adapter.target, true, true);
    await activityReporter.setReporter(reporter.address, true);
    await activityReporter.setSupportedChain(reporter.address, 84532n, true);
    await adapter.setActivityVerified(sourceActivityId, user.address, true);

    await activityReporter.connect(reporter).submitWithAdapter(
      user.address,
      84532n,
      sourceActivityId,
      activityType,
      projectId,
      "0x1234",
    );

    expect(await activityRegistry.activityCount(user.address)).to.equal(1n);
    const activity = await activityRegistry.getActivity(user.address, 0);
    expect(activity.chainId).to.equal(84532n);
    expect(activity.projectId).to.equal(projectId);
    expect(activity.verified).to.equal(true);
  });
});
