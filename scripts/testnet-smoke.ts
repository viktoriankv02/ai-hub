import { network } from "hardhat";
import { EVM_NETWORKS } from "../deploy/config/networks";
import { validateDeploymentEnvironment } from "../deploy/config/validate";
import { loadDeployment } from "../deploy/utils/deployment";

const target = process.env.AI_HUB_NETWORK ?? "baseSepolia";
validateDeploymentEnvironment(target);

const config = EVM_NETWORKS[target];
const { ethers } = await network.connect();
const [admin] = await ethers.getSigners();
const adminAddress = await admin.getAddress();
const userAddress = process.env.AI_HUB_SMOKE_USER_ADDRESS ?? adminAddress;
const deployment = await loadDeployment(target);

const points = await ethers.getContractAt("PointsModule", deployment.contracts.PointsModule);
const policy = await ethers.getContractAt("RewardPolicyEngine", deployment.contracts.RewardPolicyEngine);
const eligibility = await ethers.getContractAt("EligibilityEngine", deployment.contracts.EligibilityEngine);
const registry = await ethers.getContractAt("ActivityRegistry", deployment.contracts.ActivityRegistry);
const chainRegistry = await ethers.getContractAt("ChainRegistry", deployment.contracts.ChainRegistry);
const adapter = await ethers.getContractAt("EVMChainAdapter", deployment.contracts.EVMChainAdapter);
const reporter = await ethers.getContractAt("ActivityReporter", deployment.contracts.ActivityReporter);
const vault = await ethers.getContractAt("RewardVault", deployment.contracts.RewardVault);
const router = await ethers.getContractAt("ClaimRouter", deployment.contracts.ClaimRouter);

if (!(await chainRegistry.isSupported(config.chainId))) throw new Error("Target chain is not registered");
if (!(await reporter.reporters(adminAddress))) {
  await (await reporter.setReporter(adminAddress, true)).wait();
}
if (!(await reporter.supportedChains(adminAddress, config.chainId))) {
  await (await reporter.setSupportedChain(adminAddress, config.chainId, true)).wait();
}

const suffix = Date.now().toString();
const activityType = ethers.id("SWAP");
const projectId = ethers.id(`AI_HUB_SMOKE_${suffix}`);
const sourceActivityId = ethers.id(`SOURCE_ACTIVITY_${suffix}`);
const policyId = ethers.id(`SMOKE_POLICY_${target}_${suffix}`);
const activityId = ethers.id(`REGISTRY_ACTIVITY_${suffix}`);
const claimId = ethers.id(`SMOKE_CLAIM_${target}_${suffix}`);
const reward = ethers.parseEther(process.env.AI_HUB_SMOKE_REWARD_ETH ?? "0.001");

await (await registry.setActivityType(activityType, true)).wait();
await (await adapter.setActivityVerified(sourceActivityId, userAddress, true)).wait();

await (await policy.setPolicy(policyId, activityType, config.chainId, 100n, true, true)).wait();
await (await eligibility.setRule(policyId, 0, 0, 1, 1000n, true, true)).wait();
await (await eligibility.initialize(policyId, userAddress)).wait();

if (!(await policy.claimExecutors(deployment.contracts.ClaimRouter))) {
  await (await policy.setClaimExecutor(deployment.contracts.ClaimRouter, true)).wait();
}
if (!(await eligibility.claimExecutors(deployment.contracts.ClaimRouter))) {
  await (await eligibility.setClaimExecutor(deployment.contracts.ClaimRouter, true)).wait();
}
if (!(await points.pointWriters(deployment.contracts.RewardPolicyEngine))) {
  await (await points.setPointWriter(deployment.contracts.RewardPolicyEngine, true)).wait();
}
if (!(await vault.rewardManagers(deployment.contracts.ClaimRouter))) {
  await (await vault.setRewardManager(deployment.contracts.ClaimRouter, true)).wait();
}

await (await ownerSend(admin, vault.target, reward)).wait();

const submitTx = await reporter.connect(admin).submitWithAdapter(
  userAddress,
  config.chainId,
  sourceActivityId,
  activityType,
  projectId,
  "0x",
);
await submitTx.wait();

const count = await registry.activityCount(userAddress);
if (count === 0n) throw new Error("Activity was not recorded");

const claimData = router.interface.encodeFunctionData(
  "claimNative(bytes32,bytes32,bytes32,address,bool,uint256)",
  [claimId, policyId, activityId, userAddress, true, reward],
);
const claimTx = await admin.sendTransaction({ to: deployment.contracts.ClaimRouter, data: claimData });
await claimTx.wait();

if (!(await router.executed(claimId))) throw new Error("Router did not execute claim");
if (!(await vault.claimed(claimId))) throw new Error("Vault did not record claim");
if ((await points.pointsOf(userAddress)) < 100n) throw new Error("Points were not awarded");

console.log(`AI Hub testnet smoke passed on ${config.name}.`);
console.log(`  user:       ${userAddress}`);
console.log(`  activity:   ${sourceActivityId}`);
console.log(`  policy:     ${policyId}`);
console.log(`  claim:      ${claimId}`);
console.log(`  reward ETH: ${ethers.formatEther(reward)}`);

async function ownerSend(signer: typeof admin, to: string, value: bigint) {
  return signer.sendTransaction({ to, value });
}
