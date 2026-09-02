import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";
import {
  assertAddress,
  loadDeploymentIfExists,
  saveDeployment,
  validateDeploymentRecord,
  type DeploymentRecord,
} from "./utils/deployment";

const target = process.env.AI_HUB_NETWORK;
if (!target) {
  throw new Error(
    "Missing AI_HUB_NETWORK. Set it explicitly, for example: AI_HUB_NETWORK=inkSepolia",
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

const admin = assertAddress("AI_HUB_ADMIN_ADDRESS", requireEnv("AI_HUB_ADMIN_ADDRESS"));
const existing = await loadDeploymentIfExists(target);
if (existing) validateDeploymentRecord(existing, target, config.chainId);

const record: DeploymentRecord = existing ?? {
  network: target,
  chainId: config.chainId,
  deployedAt: new Date().toISOString(),
  contracts: {},
};

console.log(`Deploying AI Hub core to ${config.name} (${config.chainId})`);
if (existing) console.log("Existing deployment record found; resuming/reusing verified contracts.");

async function deployOrReuse(name: string, args: unknown[]): Promise<string> {
  const saved = record.contracts[name];
  if (saved) {
    const address = assertAddress(name, saved);
    const code = await ethers.provider.getCode(address);
    if (code === "0x") throw new Error(`${name} is recorded at ${address}, but no contract code exists there`);

    const contract = await ethers.getContractAt(name, address);
    const owner = await contract.owner();
    if (ethers.getAddress(owner) !== admin) {
      throw new Error(`${name} owner ${owner} does not match AI_HUB_ADMIN_ADDRESS ${admin}`);
    }
    console.log(`Reusing ${name}: ${address}`);
    return address;
  }

  const contract = await ethers.deployContract(name, args);
  await contract.waitForDeployment();
  const address = assertAddress(name, contract.target.toString());
  record.contracts[name] = address;
  await saveDeployment(record);
  console.log(`Deployed ${name}: ${address}`);
  return address;
}

const points = await deployOrReuse("PointsModule", [admin]);
const policy = await deployOrReuse("RewardPolicyEngine", [admin, points]);
const eligibility = await deployOrReuse("EligibilityEngine", [admin]);
const registry = await deployOrReuse("ActivityRegistry", [admin]);
const verifierRegistry = await deployOrReuse("VerifierRegistry", [admin]);
const chainRegistry = await deployOrReuse("ChainRegistry", [admin]);
const activityReporter = await deployOrReuse("ActivityReporter", [admin, registry, chainRegistry]);
const vault = await deployOrReuse("RewardVault", [admin]);
await deployOrReuse("ClaimRouter", [admin, eligibility, policy, vault]);

await saveDeployment(record);
console.log("AI Hub core deployment completed.");
