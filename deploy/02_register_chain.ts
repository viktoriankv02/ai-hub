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

const registry = await ethers.getContractAt("ActivityRegistry", deployment.contracts.ActivityRegistry);
const activityReporter = await ethers.getContractAt("ActivityReporter", deployment.contracts.ActivityReporter);

const types = (process.env.AI_HUB_ACTIVITY_TYPES ?? "SWAP,BRIDGE,LIQUIDITY,STAKE,MINT").split(",").map((v) => v.trim()).filter(Boolean);

for (const type of types) {
  const id = ethers.id(type);
  await registry.setActivityType(id, true);
  console.log(`Registered activity type: ${type}`);
}

const operationalReporter = process.env.AI_HUB_REPORTER_ADDRESS;
if (operationalReporter) {
  await activityReporter.setReporter(operationalReporter, true);
  await activityReporter.setSupportedChain(operationalReporter, config.chainId, true);
}

if ((await registry.owner()) !== admin) throw new Error("ActivityRegistry owner mismatch");

console.log(`Chain ${config.name} (${config.chainId}) registered for AI Hub activity reporting.`);
