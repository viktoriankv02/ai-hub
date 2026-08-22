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
  throw new Error(`Network mismatch: connected ${connectedChainId}, expected ${config.chainId}`);
}

const admin = requireEnv("AI_HUB_ADMIN_ADDRESS");
const rewardToken = requireEnv("AI_REWARD_TOKEN_ADDRESS");
const activityRegistry = requireEnv("ACTIVITY_REGISTRY_ADDRESS");
const existing = await loadDeployment(target);

console.log(`Deploying AI runtime to ${config.name} (${config.chainId})`);

const runtime = await ethers.deployContract("AIAgentRuntime", [admin]);
await runtime.waitForDeployment();

const engine = await ethers.deployContract("AIAgentEngine", [admin, runtime.target, rewardToken]);
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
    AIAgentRuntime: runtime.target.toString(),
    AIAgentEngine: engine.target.toString(),
    AICompletionReporter: reporter.target.toString(),
    RewardToken: rewardToken,
    ActivityRegistry: activityRegistry,
  },
});

console.log("AI runtime deployment completed.");
console.log(`AIAgentRuntime=${runtime.target}`);
console.log(`AIAgentEngine=${engine.target}`);
console.log(`AICompletionReporter=${reporter.target}`);
console.log("Next: run 07_configure_ai_runtime.ts as the configured AI_HUB_ADMIN_ADDRESS.");
