import "dotenv/config";
import { network } from "hardhat";
import { EVM_NETWORKS } from "../deploy/config/networks";
import { validateDeploymentEnvironment } from "../deploy/config/validate";
import { assertAddress, loadDeployment, validateDeploymentRecord } from "../deploy/utils/deployment";

const target = "base";
validateDeploymentEnvironment(target);

const config = EVM_NETWORKS[target];
const { ethers } = await network.connect();
const connectedChainId = Number((await ethers.provider.getNetwork()).chainId);
if (connectedChainId !== config.chainId) {
  throw new Error(`Network mismatch: connected ${connectedChainId}, expected ${config.chainId}`);
}

const deployment = await loadDeployment(target);
validateDeploymentRecord(deployment, target, config.chainId);

const [signer] = await ethers.getSigners();
const deployer = await signer.getAddress();
const configuredAdmin = process.env.AI_HUB_ADMIN_ADDRESS;
const admin = configuredAdmin && ethers.isAddress(configuredAdmin)
  ? ethers.getAddress(configuredAdmin)
  : deployer;

if (admin.toLowerCase() !== deployer.toLowerCase()) {
  throw new Error(`Admin ${admin} does not match deployer ${deployer}`);
}

const required = [
  "PointsModule",
  "RewardPolicyEngine",
  "EligibilityEngine",
  "ActivityRegistry",
  "VerifierRegistry",
  "ChainRegistry",
  "ActivityReporter",
  "RewardVault",
  "ClaimRouter",
  "EVMChainAdapter",
] as const;

for (const name of required) {
  const address = assertAddress(name, deployment.contracts[name]);
  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`${name} has no deployed bytecode at ${address}`);
  console.log(`${name}: ${address}`);
}

const points = await ethers.getContractAt("PointsModule", deployment.contracts.PointsModule);
const policy = await ethers.getContractAt("RewardPolicyEngine", deployment.contracts.RewardPolicyEngine);
const eligibility = await ethers.getContractAt("EligibilityEngine", deployment.contracts.EligibilityEngine);
const registry = await ethers.getContractAt("ActivityRegistry", deployment.contracts.ActivityRegistry);
const verifierRegistry = await ethers.getContractAt("VerifierRegistry", deployment.contracts.VerifierRegistry);
const chainRegistry = await ethers.getContractAt("ChainRegistry", deployment.contracts.ChainRegistry);
const reporter = await ethers.getContractAt("ActivityReporter", deployment.contracts.ActivityReporter);
const vault = await ethers.getContractAt("RewardVault", deployment.contracts.RewardVault);
const claimRouter = await ethers.getContractAt("ClaimRouter", deployment.contracts.ClaimRouter);
const adapter = await ethers.getContractAt("EVMChainAdapter", deployment.contracts.EVMChainAdapter);

const ownerChecks = [
  ["PointsModule", points],
  ["RewardPolicyEngine", policy],
  ["EligibilityEngine", eligibility],
  ["ActivityRegistry", registry],
  ["VerifierRegistry", verifierRegistry],
  ["ChainRegistry", chainRegistry],
  ["ActivityReporter", reporter],
  ["RewardVault", vault],
  ["ClaimRouter", claimRouter],
  ["EVMChainAdapter", adapter],
] as const;

for (const [name, contract] of ownerChecks) {
  const owner = await contract.owner();
  if (ethers.getAddress(owner) !== admin) throw new Error(`${name} owner mismatch: ${owner}`);
}

if (!(await chainRegistry.adapterAuthorized(deployment.contracts.EVMChainAdapter))) {
  throw new Error("EVMChainAdapter is not authorized in ChainRegistry");
}

const chain = await chainRegistry.getChain(config.chainId);
if (chain.adapter.toLowerCase() !== deployment.contracts.EVMChainAdapter.toLowerCase()) {
  throw new Error("Base Mainnet registry points to a different adapter");
}
if (!chain.active || chain.testnet) {
  throw new Error("Base Mainnet registry flags are invalid");
}

if ((await adapter.chainId()) !== BigInt(config.chainId)) throw new Error("EVM adapter chainId mismatch");
if (!(await adapter.isAvailable())) throw new Error("EVM adapter is unavailable");
if ((await reporter.chainRegistry()).toLowerCase() !== deployment.contracts.ChainRegistry.toLowerCase()) {
  throw new Error("ActivityReporter ChainRegistry mismatch");
}

console.log("");
console.log("Base Mainnet deployment integrity verified.");
console.log(`Network: ${config.name} (${config.chainId})`);
console.log(`Deployer: ${deployer}`);
console.log(`Contracts: ${required.length}`);
console.log(`Explorer: https://basescan.org`);
for (const name of required) {
  const address = deployment.contracts[name];
  console.log(`${name} explorer: https://basescan.org/address/${address}`);
}
