import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";
import { saveDeployment } from "./utils/deployment";

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

const deployment = {
  network: target,
  chainId: config.chainId,
  deployedAt: new Date().toISOString(),
  contracts: {
    AIAgentRuntime: runtime.target.toString(),
    AIAgentEngine: engine.target.toString(),
    AICompletionReporter: reporter.target.toString(),
    RewardToken: rewardToken,
    ActivityRegistry: activityRegistry,
  },
};

await saveDeployment(deployment);
console.log(JSON.stringify(deployment, null, 2));
console.log("AI runtime deployment completed.");
console.log("Next: run 07_configure_ai_runtime.ts as the configured AI_HUB_ADMIN_ADDRESS.");
