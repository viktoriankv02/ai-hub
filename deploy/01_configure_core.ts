import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";
import { loadDeployment } from "./utils/deployment";

const target = process.env.AI_HUB_NETWORK ?? "sepolia";
validateDeploymentEnvironment(target);

const { ethers } = await network.connect();
const deployment = await loadDeployment(target);
const admin = requireEnv("AI_HUB_ADMIN_ADDRESS");
const config = EVM_NETWORKS[target];

console.log(`Configuring AI Hub on ${config.name}`);

const points = await ethers.getContractAt("PointsModule", deployment.contracts.PointsModule);
const policy = await ethers.getContractAt("RewardPolicyEngine", deployment.contracts.RewardPolicyEngine);
const registry = await ethers.getContractAt("ActivityRegistry", deployment.contracts.ActivityRegistry);
const chainRegistry = await ethers.getContractAt("ChainRegistry", deployment.contracts.ChainRegistry);
const vault = await ethers.getContractAt("RewardVault", deployment.contracts.RewardVault);
const reporter = await ethers.getContractAt("ActivityReporter", deployment.contracts.ActivityReporter);

await points.setPointWriter(deployment.contracts.RewardPolicyEngine, true);
await vault.setRewardManager(deployment.contracts.ClaimRouter, true);
await registry.setReporter(deployment.contracts.ActivityReporter, true);

const adapter = deployment.contracts.EVMChainAdapter;
if (!adapter) throw new Error("EVMChainAdapter missing from deployment artifact");

const registered = await chainRegistry.isSupported(config.chainId);
if (!registered) {
  await chainRegistry.setAdapterAuthorized(adapter, true);
  await chainRegistry.registerChain(
    config.chainId,
    ethers.id(target.toUpperCase()),
    ethers.id("EVM"),
    adapter,
    true,
    config.testnet,
  );
}

const operationalReporter = process.env.AI_HUB_REPORTER_ADDRESS;
if (operationalReporter) {
  await reporter.setReporter(operationalReporter, true);
  await reporter.setSupportedChain(operationalReporter, config.chainId, true);
}

if ((await points.owner()) !== admin) throw new Error("PointsModule owner mismatch");
if ((await policy.owner()) !== admin) throw new Error("RewardPolicyEngine owner mismatch");
if ((await registry.owner()) !== admin) throw new Error("ActivityRegistry owner mismatch");
if ((await chainRegistry.owner()) !== admin) throw new Error("ChainRegistry owner mismatch");
if ((await vault.owner()) !== admin) throw new Error("RewardVault owner mismatch");
if ((await reporter.owner()) !== admin) throw new Error("ActivityReporter owner mismatch");

console.log(`Chain ${config.name} is active in ChainRegistry.`);
console.log("AI Hub core configuration completed.");
