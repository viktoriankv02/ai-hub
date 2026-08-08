import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("ClaimRouter", function () {
  it("connects policy, eligibility and native vault payout", async function () {
    const [owner, user] = await ethers.getSigners();
    const points = await ethers.deployContract("PointsModule", [owner.address]);
    const policy = await ethers.deployContract("RewardPolicyEngine", [owner.address, points.target]);
    const eligibility = await ethers.deployContract("EligibilityEngine", [owner.address]);
    const vault = await ethers.deployContract("RewardVault", [owner.address]);
    const router = await ethers.deployContract("ClaimRouter", [owner.address, eligibility.target, policy.target, vault.target]);

    await points.setPointWriter(policy.target, true);
    await vault.setRewardManager(router.target, true);
    await policy.setClaimExecutor(router.target, true);
    await eligibility.setClaimExecutor(router.target, true);

    const policyId = ethers.id("BASE_SWAP_100");
    const activityType = ethers.id("SWAP");
    await policy.setPolicy(policyId, activityType, 84532n, 100n, true, true);
    await eligibility.setRule(policyId, 0, 0, 1, 1000n, true, true);
    await eligibility.initialize(policyId, user.address);

    await owner.sendTransaction({ to: vault.target, value: ethers.parseEther("1") });

    const claimId = ethers.id("CLAIM_001");
    const before = await ethers.provider.getBalance(user.address);
    await router.claimNative(claimId, policyId, ethers.id("ACTIVITY_001"), user.address, true, ethers.parseEther("0.1"));

    const after = await ethers.provider.getBalance(user.address);
    expect(after - before).to.equal(ethers.parseEther("0.1"));
    expect(await router.executed(claimId)).to.equal(true);
    expect(await points.pointsOf(user.address)).to.equal(100n);
    expect(await policy.owner()).to.equal(owner.address);
    expect(await eligibility.owner()).to.equal(owner.address);
  });

  it("rejects a replayed router claim", async function () {
    const [owner, user] = await ethers.getSigners();
    const points = await ethers.deployContract("PointsModule", [owner.address]);
    const policy = await ethers.deployContract("RewardPolicyEngine", [owner.address, points.target]);
    const eligibility = await ethers.deployContract("EligibilityEngine", [owner.address]);
    const vault = await ethers.deployContract("RewardVault", [owner.address]);
    const router = await ethers.deployContract("ClaimRouter", [owner.address, eligibility.target, policy.target, vault.target]);

    await points.setPointWriter(policy.target, true);
    await vault.setRewardManager(router.target, true);
    await policy.setClaimExecutor(router.target, true);
    await eligibility.setClaimExecutor(router.target, true);

    const policyId = ethers.id("TEST");
    await policy.setPolicy(policyId, ethers.id("MINT"), 11155111n, 50n, false, true);
    await eligibility.setRule(policyId, 0, 0, 2, 1000n, false, true);
    await eligibility.initialize(policyId, user.address);
    await owner.sendTransaction({ to: vault.target, value: 1000n });

    const claimId = ethers.id("REPLAY");
    await router.claimNative(claimId, policyId, ethers.id("ACTIVITY"), user.address, false, 100n);
    await expect(router.claimNative(claimId, policyId, ethers.id("ACTIVITY_2"), user.address, false, 100n))
      .to.be.revertedWith("Router: claim already executed");
  });
});
