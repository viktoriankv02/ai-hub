import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";
import { loadDeployment, saveDeployment } from "./utils/deployment";

const target = requireEnv("AI_HUB_NETWORK");
validateDeploymentEnvironment(target);

const config = EVM_NETWORKS[target];
const { ethers } = await network.connect();
const connectedChainId = Number((await ethers.provider.getNetwork()).chainId);

if (connectedChainId !== config.chainId) {
  throw new Error(
    `Network mismatch: connected ${connectedChainId}, expected ${config.chainId}`,
  );
}

const admin = requireEnv("AI_HUB_ADMIN_ADDRESS");
const existing = await loadDeployment(target);

const activityRegistry = existing.contracts.ActivityRegistry;
if (!activityRegistry) {
  throw new Error(
    `Deployment artifact for ${target} does not contain ActivityRegistry. Run the core deployment first.`,
  );
}

let rewardToken = existing.contracts.RewardToken ?? process.env.AI_REWARD_TOKEN_ADDRESS;

if (!rewardToken) {
  if (!config.testnet) {
    throw new Error(
      "AI_REWARD_TOKEN_ADDRESS is required for non-testnet deployments.",
    );
  }

  console.log("No AI_REWARD_TOKEN_ADDRESS configured; deploying MockRewardToken for this testnet.");

  const token = await ethers.deployContract("MockRewardToken");
  await token.waitForDeployment();
  rewardToken = await token.getAddress();

  console.log(`Test reward token deployed: ${rewardToken}`);
} else {
  console.log(`Using reward token: ${rewardToken}`);
}

console.log(`Deploying AI runtime to ${config.name} (${config.chainId})`);
console.log(`ActivityRegistry=${activityRegistry}`);
console.log(`RewardToken=${rewardToken}`);

const runtime = await ethers.deployContract("AIAgentRuntime", [admin]);
await runtime.waitForDeployment();

const engine = await ethers.deployContract("AIAgentEngine", [
  admin,
  runtime.target,
  rewardToken,
]);
await engine.waitForDeployment();

const reporter = await ethers.deployContract("AICompletionReporter", [
  admin,
  engine.target,
  activityRegistry,
]);
await reporter.waitForDeployment();

await saveDeployment({
  ...existing,
  network: target,
  chainId: config.chainId,
  deployedAt: new Date().toISOString(),
  contracts: {
    ...existing.contracts,
    RewardToken: rewardToken,
    AIAgentRuntime: runtime.target.toString(),
    AIAgentEngine: engine.target.toString(),
    AICompletionReporter: reporter.target.toString(),
  },
});

console.log("AI runtime deployment completed.");
console.log(`RewardToken=${rewardToken}`);
console.log(`AIAgentRuntime=${runtime.target}`);
console.log(`AIAgentEngine=${engine.target}`);
console.log(`AICompletionReporter=${reporter.target}`);
console.log("Next: run 07_configure_ai_runtime.ts.");
