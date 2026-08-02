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
const eligibility = await ethers.getContractAt("EligibilityEngine", deployment.contracts.EligibilityEngine);
const registry = await ethers.getContractAt("ActivityRegistry", deployment.contracts.ActivityRegistry);
const vault = await ethers.getContractAt("RewardVault", deployment.contracts.RewardVault);
const router = await ethers.getContractAt("ClaimRouter", deployment.contracts.ClaimRouter);
const reporter = await ethers.getContractAt("ActivityReporter", deployment.contracts.ActivityReporter);

// Core authorization graph.
await points.setPointWriter(deployment.contracts.RewardPolicyEngine, true);
await vault.setRewardManager(deployment.contracts.ClaimRouter, true);
await registry.setReporter(deployment.contracts.ActivityReporter, true);

// Register the deployment admin as an operational reporter only when explicitly requested.
const operationalReporter = process.env.AI_HUB_REPORTER_ADDRESS;
if (operationalReporter) {
  await reporter.setReporter(operationalReporter, true);
  await reporter.setSupportedChain(operationalReporter, config.chainId, true);
}

// The admin remains the owner at this stage. Governance/timelock can be introduced after testnet validation.
if ((await points.owner()) !== admin) throw new Error("PointsModule owner mismatch");
if ((await policy.owner()) !== admin) throw new Error("RewardPolicyEngine owner mismatch");
if ((await eligibility.owner()) !== admin) throw new Error("EligibilityEngine owner mismatch");
if ((await registry.owner()) !== admin) throw new Error("ActivityRegistry owner mismatch");
if ((await vault.owner()) !== admin) throw new Error("RewardVault owner mismatch");
if ((await router.owner()) !== admin) throw new Error("ClaimRouter owner mismatch");

console.log("AI Hub core configuration completed.");
