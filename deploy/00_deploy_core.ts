import { network } from "hardhat";
import { ethers } from "ethers";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";
import { loadDeployment, saveDeployment } from "./utils/deployment";

const target = process.env.AI_HUB_NETWORK;
if (!target) {
  throw new Error(
    "Missing AI_HUB_NETWORK. Set it explicitly, for example: AI_HUB_NETWORK=baseSepolia",
  );
}

validateDeploymentEnvironment(target);

const config = EVM_NETWORKS[target];
const { ethers: hreEthers } = await network.connect();
const connectedChainId = Number((await hreEthers.provider.getNetwork()).chainId);

if (connectedChainId !== config.chainId) {
  throw new Error(
    `Network mismatch: Hardhat connected to chain ${connectedChainId}, but AI_HUB_NETWORK=${target} expects ${config.chainId} (${config.name})`,
  );
}

const admin = requireEnv("AI_HUB_ADMIN_ADDRESS");

const CORE_CONTRACTS = [
  "PointsModule",
  "RewardPolicyEngine",
  "EligibilityEngine",
  "ActivityRegistry",
  "VerifierRegistry",
  "ChainRegistry",
  "ActivityReporter",
  "RewardVault",
  "ClaimRouter",
] as const;

type CoreContractName = (typeof CORE_CONTRACTS)[number];

async function validateExistingCore(
  contracts: Record<string, string>,
): Promise<Record<CoreContractName, string>> {
  const provider = hreEthers.provider;
  const ownableAbi = ["function owner() view returns (address)"];

  for (const name of CORE_CONTRACTS) {
    const address = contracts[name];
    if (!address || !hreEthers.isAddress(address)) {
      throw new Error(`Existing ${target} deployment is incomplete: missing or invalid ${name}`);
    }

    const code = await provider.getCode(address);
    if (code === "0x") {
      throw new Error(`Existing ${target} deployment points ${name} to an address without contract code: ${address}`);
    }

    const ownerContract = new ethers.Contract(address, ownableAbi, provider);
    const owner = await ownerContract.owner();
    if (hreEthers.getAddress(owner) !== hreEthers.getAddress(admin)) {
      throw new Error(
        `Existing ${name} owner mismatch: ${owner}; expected AI_HUB_ADMIN_ADDRESS ${admin}`,
      );
    }
  }

  return Object.fromEntries(
    CORE_CONTRACTS.map((name) => [name, contracts[name]]),
  ) as Record<CoreContractName, string>;
}

let existing;
try {
  existing = await loadDeployment(target);
} catch {
  existing = undefined;
}

if (existing) {
  const hasAnyCore = CORE_CONTRACTS.some((name) => Boolean(existing?.contracts[name]));
  const hasAllCore = CORE_CONTRACTS.every((name) => Boolean(existing?.contracts[name]));

  if (hasAnyCore && !hasAllCore) {
    throw new Error(
      `Existing ${target} deployment is partially populated. Refusing to redeploy core contracts automatically; repair the deployment artifact first.`,
    );
  }

  if (hasAllCore) {
    const contracts = await validateExistingCore(existing.contracts);
    console.log(`AI Hub core already deployed to ${config.name} (${config.chainId}).`);
    console.log("Reusing existing core contracts; no duplicate deployments will be created.");
    for (const name of CORE_CONTRACTS) console.log(`${name}=${contracts[name]}`);
    return;
  }
}

console.log(`Deploying AI Hub core to ${config.name} (${config.chainId})`);

const points = await hreEthers.deployContract("PointsModule", [admin]);
await points.waitForDeployment();
const policy = await hreEthers.deployContract("RewardPolicyEngine", [admin, points.target]);
await policy.waitForDeployment();
const eligibility = await hreEthers.deployContract("EligibilityEngine", [admin]);
await eligibility.waitForDeployment();
const registry = await hreEthers.deployContract("ActivityRegistry", [admin]);
await registry.waitForDeployment();
const verifierRegistry = await hreEthers.deployContract("VerifierRegistry", [admin]);
await verifierRegistry.waitForDeployment();
const chainRegistry = await hreEthers.deployContract("ChainRegistry", [admin]);
await chainRegistry.waitForDeployment();
const activityReporter = await hreEthers.deployContract("ActivityReporter", [admin, registry.target, chainRegistry.target]);
await activityReporter.waitForDeployment();
const vault = await hreEthers.deployContract("RewardVault", [admin]);
await vault.waitForDeployment();
const router = await hreEthers.deployContract("ClaimRouter", [admin, eligibility.target, policy.target, vault.target]);
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
