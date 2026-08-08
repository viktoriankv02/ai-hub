import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

const BASE_SEPOLIA = 84532n;

describe("AI Hub full integration", function () {
  async function deploySystem() {
    const [owner, reporter, user] = await ethers.getSigners();
    const ownerAddress = await owner.getAddress();
    const reporterAddress = await reporter.getAddress();
    const userAddress = await user.getAddress();

    const points = await ethers.deployContract("PointsModule", [ownerAddress]);
    await points.waitForDeployment();
    const pointsAddress = await points.getAddress();

    const policy = await ethers.deployContract("RewardPolicyEngine", [ownerAddress, pointsAddress]);
    await policy.waitForDeployment();
    const policyAddress = await policy.getAddress();

    const eligibility = await ethers.deployContract("EligibilityEngine", [ownerAddress]);
    await eligibility.waitForDeployment();
    const eligibilityAddress = await eligibility.getAddress();

    const vault = await ethers.deployContract("RewardVault", [ownerAddress]);
    await vault.waitForDeployment();
    const vaultAddress = await vault.getAddress();

    const router = await ethers.deployContract("ClaimRouter", [
      ownerAddress,
      eligibilityAddress,
      policyAddress,
      vaultAddress,
    ]);
    await router.waitForDeployment();
    const routerAddress = await router.getAddress();

    const registry = await ethers.deployContract("ActivityRegistry", [ownerAddress]);
    await registry.waitForDeployment();
    const registryAddress = await registry.getAddress();

    const chainRegistry = await ethers.deployContract("ChainRegistry", [ownerAddress]);
    await chainRegistry.waitForDeployment();
    const chainRegistryAddress = await chainRegistry.getAddress();

    const adapter = await ethers.deployContract("EVMChainAdapter", [
      ownerAddress,
      BASE_SEPOLIA,
      ethers.id("EVM"),
    ]);
    await adapter.waitForDeployment();
    const adapterAddress = await adapter.getAddress();

    const activityReporter = await ethers.deployContract("ActivityReporter", [
      ownerAddress,
      registryAddress,
      chainRegistryAddress,
    ]);
    await activityReporter.waitForDeployment();
    const activityReporterAddress = await activityReporter.getAddress();

    const activityType = ethers.id("SWAP");
    const projectId = ethers.id("AI_HUB_BASE_TEST");
    const policyId = ethers.id("BASE_SWAP_REWARD");

    await (await chainRegistry.setAdapterAuthorized(adapterAddress, true)).wait();
    await (
      await chainRegistry.registerChain(
        BASE_SEPOLIA,
        ethers.id("BASE_SEPOLIA"),
        ethers.id("EVM"),
        adapterAddress,
        true,
        true,
      )
    ).wait();

    await (await points.setPointWriter(policyAddress, true)).wait();
    await (await vault.setRewardManager(routerAddress, true)).wait();
    await (await policy.setClaimExecutor(routerAddress, true)).wait();
    await (await eligibility.setClaimExecutor(routerAddress, true)).wait();

    await (await registry.setActivityType(activityType, true)).wait();
    await (await registry.setReporter(activityReporterAddress, true)).wait();
    await (await activityReporter.setReporter(reporterAddress, true)).wait();
    await (await activityReporter.setSupportedChain(reporterAddress, BASE_SEPOLIA, true)).wait();

    await (await policy.setPolicy(policyId, activityType, BASE_SEPOLIA, 100n, true, true)).wait();
    await (await eligibility.setRule(policyId, 0, 0, 1, 1000n, true, true)).wait();
    await (await eligibility.initialize(policyId, userAddress)).wait();

    await (await owner.sendTransaction({ to: vaultAddress, value: ethers.parseEther("1") })).wait();

    return {
      owner,
      reporter,
      user,
      points,
      policy,
      eligibility,
      vault,
      router,
      registry,
      chainRegistry,
      adapter,
      activityReporter,
      activityType,
      projectId,
      policyId,
    };
  }

  async function claimNative(
    owner: any,
    router: any,
    claimId: string,
    policyId: string,
    activityId: string,
    userAddress: string,
    verified: boolean,
    amount: bigint,
  ) {
    const routerAddress = await router.getAddress();
    const data = router.interface.encodeFunctionData(
      "claimNative(bytes32,bytes32,bytes32,address,bool,uint256)",
      [claimId, policyId, activityId, userAddress, verified, amount],
    );
    return owner.sendTransaction({ to: routerAddress, data });
  }

  it("runs verified activity -> policy -> eligibility -> points -> native reward", async function () {
    const {
      owner,
      reporter,
      user,
      points,
      vault,
      router,
      registry,
      activityReporter,
      activityType,
      projectId,
      policyId,
    } = await deploySystem();

    const userAddress = await user.getAddress();
    await (
      await activityReporter
        .connect(reporter)
        .submit(
          userAddress,
          BASE_SEPOLIA,
          activityType,
          projectId,
          ethers.id("BASE_TX_001"),
          true,
        )
    ).wait();

    expect(await registry.activityCount(userAddress)).to.equal(1n);
    const activity = await registry.getActivity(userAddress, 0);
    expect(activity.chainId).to.equal(BASE_SEPOLIA);
    expect(activity.activityType).to.equal(activityType);
    expect(activity.verified).to.equal(true);

    const claimId = ethers.id("CLAIM_BASE_001");
    const activityId = ethers.id("BASE_ACTIVITY_001");
    const reward = ethers.parseEther("0.1");
    const before = await ethers.provider.getBalance(userAddress);

    await (await claimNative(owner, router, claimId, policyId, activityId, userAddress, true, reward)).wait();

    const after = await ethers.provider.getBalance(userAddress);
    expect(after - before).to.equal(reward);
    expect(await points.pointsOf(userAddress)).to.equal(100n);
    expect(await vault.claimed(claimId)).to.equal(true);
    expect(await router.executed(claimId)).to.equal(true);
    expect(await policy.owner()).to.equal(await owner.getAddress());
    expect(await eligibility.owner()).to.equal(await owner.getAddress());
  });

  it("prevents a second claim for the same policy/user", async function () {
    const { owner, reporter, user, router, activityReporter, activityType, projectId, policyId } = await deploySystem();
    const userAddress = await user.getAddress();

    await (
      await activityReporter.connect(reporter).submit(
        userAddress,
        BASE_SEPOLIA,
        activityType,
        projectId,
        ethers.id("BASE_TX_002"),
        true,
      )
    ).wait();

    const firstClaim = ethers.id("CLAIM_BASE_002");
    const secondClaim = ethers.id("CLAIM_BASE_003");
    const activityId = ethers.id("BASE_ACTIVITY_002");

    await (await claimNative(owner, router, firstClaim, policyId, activityId, userAddress, true, ethers.parseEther("0.01"))).wait();

    await expect(
      claimNative(owner, router, secondClaim, policyId, activityId, userAddress, true, ethers.parseEther("0.01")),
    ).to.be.revertedWith("Policy: already claimed");
  });

  it("blocks unverified claims before policy consumption", async function () {
    const { owner, user, points, router, policyId } = await deploySystem();
    const userAddress = await user.getAddress();

    await expect(
      claimNative(
        owner,
        router,
        ethers.id("CLAIM_UNVERIFIED"),
        policyId,
        ethers.id("UNVERIFIED_ACTIVITY"),
        userAddress,
        false,
        ethers.parseEther("0.01"),
      ),
    ).to.be.revertedWith("Router: verification required");

    expect(await points.pointsOf(userAddress)).to.equal(0n);
  });
});
