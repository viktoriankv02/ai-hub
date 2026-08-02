import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("AI Hub end-to-end reward flow", function () {
  it("verifies activity, evaluates eligibility, awards points and pays native reward", async function () {
    const [owner, user] = await ethers.getSigners();

    const points = await ethers.deployContract("PointsModule", [owner.address]);
    const policy = await ethers.deployContract("RewardPolicyEngine", [owner.address, points.target]);
    const eligibility = await ethers.deployContract("EligibilityEngine", [owner.address]);
    const vault = await ethers.deployContract("RewardVault", [owner.address]);
    const router = await ethers.deployContract("ClaimRouter", [
      owner.address,
      eligibility.target,
      policy.target,
      vault.target,
    ]);

    const adapter = await ethers.deployContract("EVMChainAdapter", [
      owner.address,
      84532,
      ethers.id("EVM"),
    ]);

    const registry = await ethers.deployContract("ChainRegistry", [owner.address]);
    const manager = await ethers.deployContract("AdapterManager", [owner.address, registry.target]);

    // Wire permissions.
    await points.setPointWriter(policy.target, true);
    await vault.setRewardManager(router.target, true);
    await registry.setAdapterAuthorized(adapter.target, true);
    await registry.registerChain(
      84532,
      ethers.id("BASE_SEPOLIA"),
      ethers.id("EVM"),
      adapter.target,
      true,
    );
    await manager.setEnabled(84532, true);

    // Create one reward policy and one eligibility rule.
    const policyId = ethers.id("BASE_SWAP_REWARD");
    const activityType = ethers.id("SWAP");
    const activityId = ethers.id("ACTIVITY_0001");
    const claimId = ethers.id("CLAIM_0001");

    await policy.setPolicy(policyId, activityType, 84532, 100n, true, true);
    await eligibility.setRule(policyId, 0, 0, 1, 1000n, true, true);
    await eligibility.initialize(policyId, user.address);

    // External verifier has confirmed the activity on Base Sepolia.
    await adapter.setActivityVerified(activityId, user.address, true);
    expect(await manager.verifyActivity(84532, activityId, user.address, "0x")).to.equal(true);

    // Fund the reward treasury.
    const reward = ethers.parseEther("0.1");
    await owner.sendTransaction({ to: vault.target, value: ethers.parseEther("1") });

    const before = await ethers.provider.getBalance(user.address);

    // ClaimRouter consumes eligibility and executes the payout.
    await router.claimNative(
      claimId,
      policyId,
      activityId,
      user.address,
      true,
      reward,
    );

    const after = await ethers.provider.getBalance(user.address);

    expect(after - before).to.equal(reward);
    expect(await router.executed(claimId)).to.equal(true);
    expect(await points.pointsOf(user.address)).to.equal(100n);
    expect(await vault.claimed(claimId)).to.equal(true);
  });

  it("stops the flow when the activity is not verified", async function () {
    const [owner, user] = await ethers.getSigners();
    const points = await ethers.deployContract("PointsModule", [owner.address]);
    const policy = await ethers.deployContract("RewardPolicyEngine", [owner.address, points.target]);
    const eligibility = await ethers.deployContract("EligibilityEngine", [owner.address]);
    const vault = await ethers.deployContract("RewardVault", [owner.address]);
    const router = await ethers.deployContract("ClaimRouter", [owner.address, eligibility.target, policy.target, vault.target]);

    const policyId = ethers.id("VERIFIED_ONLY");
    await policy.setPolicy(policyId, ethers.id("SWAP"), 84532, 25n, true, true);
    await eligibility.setRule(policyId, 0, 0, 1, 1000n, true, true);
    await eligibility.initialize(policyId, user.address);
    await vault.setRewardManager(router.target, true);
    await owner.sendTransaction({ to: vault.target, value: 1000n });

    await expect(
      router.claimNative(
        ethers.id("UNVERIFIED_CLAIM"),
        policyId,
        ethers.id("UNVERIFIED_ACTIVITY"),
        user.address,
        false,
        100n,
      ),
    ).to.be.revertedWith("Router: verification required");

    expect(await points.pointsOf(user.address)).to.equal(0n);
  });
});
