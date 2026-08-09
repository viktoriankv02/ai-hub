import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";
import { saveDeployment } from "./utils/deployment";

const target = process.env.AI_HUB_NETWORK;
if (!target) {
  throw new Error(
    "Missing AI_HUB_NETWORK. Set it explicitly, for example: AI_HUB_NETWORK=baseSepolia",
  );
}

validateDeploymentEnvironment(target);

const config = EVM_NETWORKS[target];
const { ethers } = await network.connect();
const connectedChainId = Number((await ethers.provider.getNetwork()).chainId);

if (connectedChainId !== config.chainId) {
  throw new Error(
    `Network mismatch: Hardhat connected to chain ${connectedChainId}, but AI_HUB_NETWORK=${target} expects ${config.chainId} (${config.name})`,
  );
}

const admin = requireEnv("AI_HUB_ADMIN_ADDRESS");

console.log(`Deploying AI Hub core to ${config.name} (${config.chainId})`);

const points = await ethers.deployContract("PointsModule", [admin]);
await points.waitForDeployment();
const policy = await ethers.deployContract("RewardPolicyEngine", [admin, points.target]);
await policy.waitForDeployment();
const eligibility = await ethers.deployContract("EligibilityEngine", [admin]);
await eligibility.waitForDeployment();
const registry = await ethers.deployContract("ActivityRegistry", [admin]);
await registry.waitForDeployment();
const verifierRegistry = await ethers.deployContract("VerifierRegistry", [admin]);
await verifierRegistry.waitForDeployment();
const chainRegistry = await ethers.deployContract("ChainRegistry", [admin]);
await chainRegistry.waitForDeployment();
const activityReporter = await ethers.deployContract("ActivityReporter", [admin, registry.target, chainRegistry.target]);
await activityReporter.waitForDeployment();
const vault = await ethers.deployContract("RewardVault", [admin]);
await vault.waitForDeployment();
const router = await ethers.deployContract("ClaimRouter", [admin, eligibility.target, policy.target, vault.target]);
await router.waitForDeployment();

await saveDeployment({
  network: target,
  chainId: config.chainId,
  deployedAt: new Date().toISOString(),
  contracts: {
    PointsModule: points.target.toString(),
    RewardPolicyEngine: policy.target.toString(),
    EligibilityEngine: eligibility.target.toString(),
    ActivityRegistry: registry.target.toString(),
    VerifierRegistry: verifierRegistry.target.toString(),
    ChainRegistry: chainRegistry.target.toString(),
    ActivityReporter: activityReporter.target.toString(),
    RewardVault: vault.target.toString(),
    ClaimRouter: router.target.toString(),
  },
});

console.log("AI Hub core deployment completed.");
