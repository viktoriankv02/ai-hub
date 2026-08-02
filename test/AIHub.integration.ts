import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

const BASE_SEPOLIA = 84532n;

describe("AI Hub full integration", function () {
  async function deploySystem() {
    const [owner, reporter, user] = await ethers.getSigners();

    const points = await ethers.deployContract("PointsModule", [owner.address]);
    const policy = await ethers.deployContract("RewardPolicyEngine", [owner.address, points.target]);
    const eligibility = await ethers.deployContract("EligibilityEngine", [owner.address]);
    const vault = await ethers.deployContract("RewardVault", [owner.address]);
    const router = await ethers.deployContract("ClaimRouter", [owner.address, eligibility.target, policy.target, vault.target]);
    const registry = await ethers.deployContract("ActivityRegistry", [owner.address]);
    const activityReporter = await ethers.deployContract("ActivityReporter", [owner.address, registry.target]);

    const activityType = ethers.id("SWAP");
    const projectId = ethers.id("AI_HUB_BASE_TEST");
    const policyId = ethers.id("BASE_SWAP_REWARD");

    await points.setPointWriter(policy.target, true);
    await vault.setRewardManager(router.target, true);

    await registry.setActivityType(activityType, true);
    await registry.setReporter(activityReporter.target, true);
    await activityReporter.setReporter(reporter.address, true);
    await activityReporter.setSupportedChain(reporter.address, BASE_SEPOLIA, true);

    await policy.setPolicy(policyId, activityType, BASE_SEPOLIA, 100n, true, true);
    await eligibility.setRule(policyId, 0, 0, 1, 1000n, true, true);
    await eligibility.initialize(policyId, user.address);

    // After configuration, policy and eligibility are callable only through ClaimRouter.
    await policy.transferOwnership(router.target);
    await eligibility.transferOwnership(router.target);

    await owner.sendTransaction({ to: vault.target, value: ethers.parseEther("1") });

    return { owner, reporter, user, points, policy, eligibility, vault, router, registry, activityReporter, activityType, projectId, policyId };
  }

  it("runs verified activity -> policy -> eligibility -> points -> native reward", async function () {
    const { reporter, user, points, vault, router, registry, activityReporter, activityType, projectId, policyId } = await deploySystem();

    const tx = await activityReporter.connect(reporter).submit(
      user.address,
      BASE_SEPOLIA,
      activityType,
      projectId,
      ethers.id("BASE_TX_001"),
      true,
    );
    await tx.wait();

    expect(await registry.activityCount(user.address)).to.equal(1n);
    const activity = await registry.getActivity(user.address, 0);
    expect(activity.chainId).to.equal(BASE_SEPOLIA);
    expect(activity.activityType).to.equal(activityType);
    expect(activity.verified).to.equal(true);

    const claimId = ethers.id("CLAIM_BASE_001");
    const activityId = 0n;
    const reward = ethers.parseEther("0.1");
    const before = await ethers.provider.getBalance(user.address);

    await router["claimNative(bytes32,bytes32,bytes32,address,bool,uint256)"](
      claimId,
      policyId,
      ethers.zeroPadValue(ethers.toBeHex(activityId), 32),
      user.address,
      true,
      reward,
    );

    const after = await ethers.provider.getBalance(user.address);
    expect(after - before).to.equal(reward);
    expect(await points.pointsOf(user.address)).to.equal(100n);
    expect(await vault.claimed(claimId)).to.equal(true);
    expect(await router.executed(claimId)).to.equal(true);
  });

  it("prevents a second claim for the same policy/user", async function () {
    const { reporter, user, router, activityReporter, activityType, projectId, policyId } = await deploySystem();

    await activityReporter.connect(reporter).submit(
      user.address,
      BASE_SEPOLIA,
      activityType,
      projectId,
      ethers.id("BASE_TX_002"),
      true,
    );

    const firstClaim = ethers.id("CLAIM_BASE_002");
    const secondClaim = ethers.id("CLAIM_BASE_003");
    const activityId = ethers.zeroPadValue(ethers.toBeHex(0), 32);

    await router["claimNative(bytes32,bytes32,bytes32,address,bool,uint256)"](
      firstClaim,
      policyId,
      activityId,
      user.address,
      true,
      ethers.parseEther("0.01"),
    );

    await expect(
      router["claimNative(bytes32,bytes32,bytes32,address,bool,uint256)"](
        secondClaim,
        policyId,
        activityId,
        user.address,
        true,
        ethers.parseEther("0.01"),
      ),
    ).to.be.revertedWith("Policy: already claimed");
  });

  it("blocks unverified claims before policy consumption", async function () {
    const { user, points, router, policyId } = await deploySystem();

    await expect(
      router["claimNative(bytes32,bytes32,bytes32,address,bool,uint256)"](
        ethers.id("CLAIM_UNVERIFIED"),
        policyId,
        ethers.id("UNVERIFIED_ACTIVITY"),
        user.address,
        false,
        ethers.parseEther("0.01"),
      ),
    ).to.be.revertedWith("Router: verification required");

    expect(await points.pointsOf(user.address)).to.equal(0n);
  });
});
