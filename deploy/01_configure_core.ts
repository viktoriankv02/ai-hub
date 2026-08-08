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

console.log(`Configuring AI Hub core on ${config.name}`);

const points = await ethers.getContractAt("PointsModule", deployment.contracts.PointsModule);
const policy = await ethers.getContractAt("RewardPolicyEngine", deployment.contracts.RewardPolicyEngine);
const eligibility = await ethers.getContractAt("EligibilityEngine", deployment.contracts.EligibilityEngine);
const registry = await ethers.getContractAt("ActivityRegistry", deployment.contracts.ActivityRegistry);
const chainRegistry = await ethers.getContractAt("ChainRegistry", deployment.contracts.ChainRegistry);
const vault = await ethers.getContractAt("RewardVault", deployment.contracts.RewardVault);
const reporter = await ethers.getContractAt("ActivityReporter", deployment.contracts.ActivityReporter);

if (!(await points.pointWriters(deployment.contracts.RewardPolicyEngine))) {
  await (await points.setPointWriter(deployment.contracts.RewardPolicyEngine, true)).wait();
}

if (!(await vault.rewardManagers(deployment.contracts.ClaimRouter))) {
  await (await vault.setRewardManager(deployment.contracts.ClaimRouter, true)).wait();
}

if (!(await registry.reporters(deployment.contracts.ActivityReporter))) {
  await (await registry.setReporter(deployment.contracts.ActivityReporter, true)).wait();
}

const operationalReporter = process.env.AI_HUB_REPORTER_ADDRESS;
if (operationalReporter) {
  if (!(await reporter.reporters(operationalReporter))) {
    await (await reporter.setReporter(operationalReporter, true)).wait();
  }
  if (!(await reporter.supportedChains(operationalReporter, config.chainId))) {
    await (await reporter.setSupportedChain(operationalReporter, config.chainId, true)).wait();
  }
}

if ((await points.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("PointsModule owner mismatch");
if ((await policy.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("RewardPolicyEngine owner mismatch");
if ((await eligibility.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("EligibilityEngine owner mismatch");
if ((await registry.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("ActivityRegistry owner mismatch");
if ((await chainRegistry.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("ChainRegistry owner mismatch");
if ((await vault.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("RewardVault owner mismatch");
if ((await reporter.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("ActivityReporter owner mismatch");

console.log("Core permissions configured.");
console.log("AI Hub core configuration completed.");
