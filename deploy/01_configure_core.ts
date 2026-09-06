import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";
import { loadDeployment } from "./utils/deployment";

const target = requireEnv("AI_HUB_NETWORK");
validateDeploymentEnvironment(target);

const { ethers } = await network.connect();
const connectedChainId = Number((await ethers.provider.getNetwork()).chainId);
const config = EVM_NETWORKS[target];
if (connectedChainId !== config.chainId) {
  throw new Error(
    `Network mismatch: Hardhat connected to chain ${connectedChainId}, but AI_HUB_NETWORK=${target} expects ${config.chainId} (${config.name})`,
  );
}

const [deployer] = await ethers.getSigners();
const deployerAddress = await deployer.getAddress();
const configuredAdmin = process.env.AI_HUB_ADMIN_ADDRESS;
const admin = configuredAdmin && ethers.isAddress(configuredAdmin)
  ? ethers.getAddress(configuredAdmin)
  : deployerAddress;

if (configuredAdmin && !ethers.isAddress(configuredAdmin)) {
  console.warn("AI_HUB_ADMIN_ADDRESS is invalid and will be ignored; using the deployer address as admin.");
}

if (admin.toLowerCase() !== deployerAddress.toLowerCase()) {
  throw new Error(
    `AI_HUB_ADMIN_ADDRESS ${admin} must match the connected deployer ${deployerAddress}`,
  );
}

const deployment = await loadDeployment(target);

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
  const reporterAddress = ethers.isAddress(operationalReporter)
    ? ethers.getAddress(operationalReporter)
    : undefined;

  if (!reporterAddress) throw new Error("AI_HUB_REPORTER_ADDRESS is invalid");

  if (!(await reporter.reporters(reporterAddress))) {
    await (await reporter.setReporter(reporterAddress, true)).wait();
  }
  if (!(await reporter.supportedChains(reporterAddress, config.chainId))) {
    await (await reporter.setSupportedChain(reporterAddress, config.chainId, true)).wait();
  }
}

if ((await points.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("PointsModule owner mismatch");
if ((await policy.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("RewardPolicyEngine owner mismatch");
if ((await eligibility.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("EligibilityEngine owner mismatch");
if ((await registry.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("ActivityRegistry owner mismatch");
if ((await chainRegistry.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("ChainRegistry owner mismatch");
if ((await vault.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("RewardVault owner mismatch");
if ((await reporter.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("ActivityReporter owner mismatch");

console.log(`Admin/deployer: ${admin}`);
console.log("Core permissions configured.");
console.log("AI Hub core configuration completed.");
