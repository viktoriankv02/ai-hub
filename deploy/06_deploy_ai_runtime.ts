import { network } from "hardhat";
import { ethers } from "ethers";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";
import { loadDeployment, saveDeployment } from "./utils/deployment";

const target = requireEnv("AI_HUB_NETWORK");
validateDeploymentEnvironment(target);

const config = EVM_NETWORKS[target];
const { ethers: hreEthers } = await network.connect();
const connectedChainId = Number((await hreEthers.provider.getNetwork()).chainId);

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

const RUNTIME_CONTRACTS = [
  "RewardToken",
  "AIAgentRuntime",
  "AIAgentEngine",
  "AICompletionReporter",
] as const;

async function validateExistingRuntime(contracts: Record<string, string>): Promise<void> {
  const provider = hreEthers.provider;
  const ownableAbi = ["function owner() view returns (address)"];

  for (const name of RUNTIME_CONTRACTS) {
    const address = contracts[name];
    if (!address || !hreEthers.isAddress(address)) {
      throw new Error(`Existing ${target} deployment is incomplete: missing or invalid ${name}`);
    }

    const code = await provider.getCode(address);
    if (code === "0x") {
      throw new Error(`Existing ${target} deployment points ${name} to an address without contract code: ${address}`);
    }

    if (name !== "RewardToken") {
      const ownerContract = new ethers.Contract(address, ownableAbi, provider);
      const owner = await ownerContract.owner();
      if (hreEthers.getAddress(owner) !== hreEthers.getAddress(admin)) {
        throw new Error(
          `Existing ${name} owner mismatch: ${owner}; expected AI_HUB_ADMIN_ADDRESS ${admin}`,
        );
      }
    }
  }

  const engine = new ethers.Contract(
    contracts.AIAgentEngine,
    ["function runtime() view returns (address)", "function rewardToken() view returns (address)"],
    provider,
  );
  const runtimeAddress = await engine.runtime();
  const rewardTokenAddress = await engine.rewardToken();

  if (hreEthers.getAddress(runtimeAddress) !== hreEthers.getAddress(contracts.AIAgentRuntime)) {
    throw new Error(`AIAgentEngine runtime mismatch: ${runtimeAddress}`);
  }
  if (hreEthers.getAddress(rewardTokenAddress) !== hreEthers.getAddress(contracts.RewardToken)) {
    throw new Error(`AIAgentEngine reward token mismatch: ${rewardTokenAddress}`);
  }

  const reporter = new ethers.Contract(
    contracts.AICompletionReporter,
    ["function engine() view returns (address)", "function activityRegistry() view returns (address)"],
    provider,
  );
  const reporterEngine = await reporter.engine();
  const reporterRegistry = await reporter.activityRegistry();

  if (hreEthers.getAddress(reporterEngine) !== hreEthers.getAddress(contracts.AIAgentEngine)) {
    throw new Error(`AICompletionReporter engine mismatch: ${reporterEngine}`);
  }
  if (hreEthers.getAddress(reporterRegistry) !== hreEthers.getAddress(activityRegistry)) {
    throw new Error(`AICompletionReporter ActivityRegistry mismatch: ${reporterRegistry}`);
  }
}

const hasAnyRuntime = RUNTIME_CONTRACTS.some((name) => Boolean(existing.contracts[name]));
const hasAllRuntime = RUNTIME_CONTRACTS.every((name) => Boolean(existing.contracts[name]));

if (hasAnyRuntime && !hasAllRuntime) {
  throw new Error(
    `Existing ${target} deployment is partially populated for AI runtime. Refusing to redeploy automatically; repair the deployment artifact first.`,
  );
}

if (hasAllRuntime) {
  await validateExistingRuntime(existing.contracts);
  console.log(`AI runtime already deployed to ${config.name} (${config.chainId}).`);
  console.log("Reusing existing AI runtime contracts; no duplicate deployments will be created.");
  for (const name of RUNTIME_CONTRACTS) console.log(`${name}=${existing.contracts[name]}`);
  console.log("Next: run 07_configure_ai_runtime.ts if configuration has not been applied.");
  return;
}

let rewardToken = process.env.AI_REWARD_TOKEN_ADDRESS;

if (!rewardToken) {
  if (!config.testnet) {
    throw new Error(
      "AI_REWARD_TOKEN_ADDRESS is required for non-testnet deployments.",
    );
  }

  console.log("No AI_REWARD_TOKEN_ADDRESS configured; deploying MockRewardToken for this testnet.");

  const token = await hreEthers.deployContract("MockRewardToken");
  await token.waitForDeployment();
  rewardToken = await token.getAddress();

  console.log(`Test reward token deployed: ${rewardToken}`);
} else {
  console.log(`Using reward token: ${rewardToken}`);
}

console.log(`Deploying AI runtime to ${config.name} (${config.chainId})`);
console.log(`ActivityRegistry=${activityRegistry}`);
console.log(`RewardToken=${rewardToken}`);

const runtime = await hreEthers.deployContract("AIAgentRuntime", [admin]);
await runtime.waitForDeployment();

const engine = await hreEthers.deployContract("AIAgentEngine", [
  admin,
  runtime.target,
  rewardToken,
]);
await engine.waitForDeployment();

const reporter = await hreEthers.deployContract("AICompletionReporter", [
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
