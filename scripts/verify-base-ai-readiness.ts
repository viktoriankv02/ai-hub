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

const rewardToken = assertAddress(
  "AI_REWARD_TOKEN_ADDRESS",
  process.env.AI_REWARD_TOKEN_ADDRESS ?? "",
);

const requiredCore = [
  "ActivityRegistry",
  "ChainRegistry",
  "ActivityReporter",
] as const;

for (const name of requiredCore) {
  const address = assertAddress(name, deployment.contracts[name]);
  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`${name} has no bytecode at ${address}`);
}

const rewardTokenCode = await ethers.provider.getCode(rewardToken);
if (rewardTokenCode === "0x") {
  throw new Error(`AI_REWARD_TOKEN_ADDRESS has no deployed bytecode: ${rewardToken}`);
}

const activityRegistry = await ethers.getContractAt(
  "ActivityRegistry",
  deployment.contracts.ActivityRegistry,
);
const chainRegistry = await ethers.getContractAt(
  "ChainRegistry",
  deployment.contracts.ChainRegistry,
);
const reporter = await ethers.getContractAt(
  "ActivityReporter",
  deployment.contracts.ActivityReporter,
);
const adapter = await ethers.getContractAt(
  "EVMChainAdapter",
  deployment.contracts.EVMChainAdapter,
);

if ((await activityRegistry.owner()).toLowerCase() !== admin.toLowerCase()) {
  throw new Error("ActivityRegistry owner mismatch");
}
if ((await chainRegistry.owner()).toLowerCase() !== admin.toLowerCase()) {
  throw new Error("ChainRegistry owner mismatch");
}
if ((await reporter.owner()).toLowerCase() !== admin.toLowerCase()) {
  throw new Error("ActivityReporter owner mismatch");
}
if ((await adapter.owner()).toLowerCase() !== admin.toLowerCase()) {
  throw new Error("EVMChainAdapter owner mismatch");
}

if (!(await chainRegistry.adapterAuthorized(deployment.contracts.EVMChainAdapter))) {
  throw new Error("EVMChainAdapter is not authorized");
}

const chain = await chainRegistry.getChain(config.chainId);
if (chain.adapter.toLowerCase() !== deployment.contracts.EVMChainAdapter.toLowerCase()) {
  throw new Error("Base Mainnet adapter registration mismatch");
}
if (!chain.active || chain.testnet) {
  throw new Error("Base Mainnet registry flags are invalid");
}
if ((await adapter.chainId()) !== BigInt(config.chainId)) {
  throw new Error("EVMChainAdapter chainId mismatch");
}
if (!(await adapter.isAvailable())) {
  throw new Error("EVMChainAdapter is unavailable");
}
if ((await reporter.chainRegistry()).toLowerCase() !== deployment.contracts.ChainRegistry.toLowerCase()) {
  throw new Error("ActivityReporter ChainRegistry mismatch");
}
if (!(await chainRegistry.isSupported(config.chainId))) {
  throw new Error("Base Mainnet is not supported by ChainRegistry");
}

const completionCaller = process.env.AI_COMPLETION_CALLER_ADDRESS
  ? assertAddress("AI_COMPLETION_CALLER_ADDRESS", process.env.AI_COMPLETION_CALLER_ADDRESS)
  : admin;
const attester = process.env.AI_COMPLETION_ATTESTER_ADDRESS
  ? assertAddress("AI_COMPLETION_ATTESTER_ADDRESS", process.env.AI_COMPLETION_ATTESTER_ADDRESS)
  : completionCaller;
const payoutManager = process.env.AI_PAYOUT_MANAGER_ADDRESS
  ? assertAddress("AI_PAYOUT_MANAGER_ADDRESS", process.env.AI_PAYOUT_MANAGER_ADDRESS)
  : admin;

const provider = ethers.provider;
const balance = await provider.getBalance(deployer);

console.log("Base AI job stack readiness");
console.log(`Network:          ${config.name} (${config.chainId})`);
console.log(`Deployer/admin:   ${deployer}`);
console.log(`Core footprint:   10 contracts verified`);
console.log(`Reward token:     ${rewardToken}`);
console.log(`Completion caller:${completionCaller}`);
console.log(`Attester:         ${attester}`);
console.log(`Payout manager:   ${payoutManager}`);
console.log(`Gas balance:      ${balance.toString()} wei`);
console.log("");
console.log("READY: Base Mainnet core is consistent and AI job stack inputs are valid.");
