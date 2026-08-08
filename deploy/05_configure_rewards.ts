import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { validateDeploymentEnvironment } from "./config/validate";
import { loadDeployment } from "./utils/deployment";

const target = process.env.AI_HUB_NETWORK ?? "sepolia";
validateDeploymentEnvironment(target);

const config = EVM_NETWORKS[target];
const { ethers } = await network.connect();
const deployment = await loadDeployment(target);

const policy = await ethers.getContractAt("RewardPolicyEngine", deployment.contracts.RewardPolicyEngine);
const eligibility = await ethers.getContractAt("EligibilityEngine", deployment.contracts.EligibilityEngine);
const router = deployment.contracts.ClaimRouter;

const activityName = process.env.AI_HUB_REWARD_ACTIVITY ?? "SWAP";
const policyName = process.env.AI_HUB_POLICY_NAME ?? `${target.toUpperCase()}_${activityName}_REWARD`;
const points = BigInt(process.env.AI_HUB_REWARD_POINTS ?? "100");
const maxClaims = Number(process.env.AI_HUB_MAX_CLAIMS ?? "1");
const maxPointsPerPeriod = BigInt(process.env.AI_HUB_MAX_POINTS_PER_PERIOD ?? "1000");
const minIdentityAge = BigInt(process.env.AI_HUB_MIN_IDENTITY_AGE ?? "0");
const cooldown = BigInt(process.env.AI_HUB_REWARD_COOLDOWN ?? "0");

if (points <= 0n) throw new Error("AI_HUB_REWARD_POINTS must be positive");
if (maxClaims <= 0) throw new Error("AI_HUB_MAX_CLAIMS must be positive");
if (maxPointsPerPeriod <= 0n) throw new Error("AI_HUB_MAX_POINTS_PER_PERIOD must be positive");

const activityType = ethers.id(activityName);
const policyId = ethers.id(policyName);

await (await policy.setPolicy(policyId, activityType, config.chainId, points, true, true)).wait();
await (
  await eligibility.setRule(
    policyId,
    minIdentityAge,
    cooldown,
    maxClaims,
    maxPointsPerPeriod,
    true,
    true,
  )
).wait();

if (!(await policy.claimExecutors(router))) {
  await (await policy.setClaimExecutor(router, true)).wait();
}
if (!(await eligibility.claimExecutors(router))) {
  await (await eligibility.setClaimExecutor(router, true)).wait();
}

console.log(`Reward policy configured: ${policyName}`);
console.log(`  policyId: ${policyId}`);
console.log(`  activity: ${activityName}`);
console.log(`  chain: ${config.name} (${config.chainId})`);
console.log(`  points: ${points}`);
console.log(`  max claims: ${maxClaims}`);
console.log(`  period cap: ${maxPointsPerPeriod}`);
