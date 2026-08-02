import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("RewardPolicyEngine", function () {
  it("awards points once for a matching verified activity", async function () {
    const [owner, user] = await ethers.getSigners();
    const points = await ethers.deployContract("PointsModule", [owner.address]);
    const policy = await ethers.deployContract("RewardPolicyEngine", [
      owner.address,
      points.target,
    ]);

    // The policy engine is the points writer.
    await points.transferOwnership(policy.target);

    const policyId = ethers.id("BASE_SWAP_100");
    const activityType = ethers.id("SWAP");
    const activityId = ethers.id("ACTIVITY_001");

    await policy.setPolicy(policyId, activityType, 84532, 100n, true, true);
    await policy.claim(policyId, user.address, activityId, activityType, 84532, true);

    expect(await points.pointsOf(user.address)).to.equal(100n);
    expect(await policy.claimed(policyId, user.address)).to.equal(true);

    await expect(
      policy.claim(policyId, user.address, ethers.id("ACTIVITY_002"), activityType, 84532, true),
    ).to.be.revertedWith("Policy: already claimed");
  });

  it("rejects wrong chain, wrong activity and unverified activity", async function () {
    const [owner, user] = await ethers.getSigners();
    const points = await ethers.deployContract("PointsModule", [owner.address]);
    const policy = await ethers.deployContract("RewardPolicyEngine", [
      owner.address,
      points.target,
    ]);
    await points.transferOwnership(policy.target);

    const policyId = ethers.id("ARB_BRIDGE_250");
    const bridge = ethers.id("BRIDGE");
    await policy.setPolicy(policyId, bridge, 42161, 250n, true, true);

    await expect(
      policy.claim(policyId, user.address, ethers.id("A"), bridge, 84532, true),
    ).to.be.revertedWith("Policy: chain mismatch");

    await expect(
      policy.claim(policyId, user.address, ethers.id("B"), ethers.id("SWAP"), 42161, true),
    ).to.be.revertedWith("Policy: activity mismatch");

    await expect(
      policy.claim(policyId, user.address, ethers.id("C"), bridge, 42161, false),
    ).to.be.revertedWith("Policy: verification required");
  });
});
