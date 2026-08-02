import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("ActivityReporter + chain adapter", function () {
  it("accepts activity only after adapter verification", async function () {
    const [owner, reporter, user] = await ethers.getSigners();
    const registry = await ethers.deployContract("ActivityRegistry", [owner.address]);
    const gateway = await ethers.deployContract("ActivityReporter", [owner.address, registry.target]);
    const adapter = await ethers.deployContract("EVMChainAdapter", [owner.address, 84532n, ethers.id("EVM")]);

    const activityType = ethers.id("SWAP");
    const projectId = ethers.id("ADAPTER_TEST");
    const sourceActivityId = ethers.id("BASE_TX_001");

    await registry.setActivityType(activityType, true);
    await registry.setReporter(gateway.target, true);
    await gateway.setReporter(reporter.address, true);
    await gateway.setSupportedChain(reporter.address, 84532n, true);
    await gateway.setChainAdapter(84532n, adapter.target);

    await expect(
      gateway.connect(reporter).submitWithAdapter(
        user.address,
        84532n,
        sourceActivityId,
        activityType,
        projectId,
        "0x1234",
      ),
    ).to.be.revertedWith("Reporter: proof invalid");

    await adapter.setActivityVerified(sourceActivityId, user.address, true);

    await gateway.connect(reporter).submitWithAdapter(
      user.address,
      84532n,
      sourceActivityId,
      activityType,
      projectId,
      "0x1234",
    );

    expect(await registry.activityCount(user.address)).to.equal(1n);
    const activity = await registry.getActivity(user.address, 0);
    expect(activity.chainId).to.equal(84532n);
    expect(activity.activityType).to.equal(activityType);
    expect(activity.metadataHash).to.equal(ethers.keccak256("0x1234"));
    expect(activity.verified).to.equal(true);
  });
});
