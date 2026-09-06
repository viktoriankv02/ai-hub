import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { validateDeploymentEnvironment } from "./config/validate";
import { loadDeployment } from "./utils/deployment";

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
const deployment = await loadDeployment(target);

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

const chainRegistry = await ethers.getContractAt("ChainRegistry", deployment.contracts.ChainRegistry);
const reporter = await ethers.getContractAt("ActivityReporter", deployment.contracts.ActivityReporter);
const adapterAddress = deployment.contracts.EVMChainAdapter;

if (!adapterAddress) throw new Error("Missing EVMChainAdapter in deployment artifact");

const chain = await chainRegistry.getChain(config.chainId);
if (chain.adapter.toLowerCase() !== adapterAddress.toLowerCase()) throw new Error("Registry adapter mismatch");
if (!chain.active) throw new Error("Registered chain is inactive");
if (Boolean(chain.testnet) !== config.testnet) {
  throw new Error(
    `Registered chain testnet flag mismatch: onchain=${chain.testnet}, config=${config.testnet}`,
  );
}
if ((await chainRegistry.isSupported(config.chainId)) !== true) throw new Error("ChainRegistry does not support target chain");

const adapter = await ethers.getContractAt("EVMChainAdapter", adapterAddress);
if ((await adapter.chainId()) !== BigInt(config.chainId)) throw new Error("Adapter chainId mismatch");
if ((await adapter.isAvailable()) !== true) throw new Error("Adapter unavailable");
if ((await chainRegistry.adapterAuthorized(adapterAddress)) !== true) throw new Error("EVM adapter is not authorized");

if ((await reporter.chainRegistry()).toLowerCase() !== deployment.contracts.ChainRegistry.toLowerCase()) {
  throw new Error("Reporter ChainRegistry mismatch");
}

if ((await chainRegistry.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("ChainRegistry owner mismatch");
if ((await reporter.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("ActivityReporter owner mismatch");
if ((await adapter.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("EVMChainAdapter owner mismatch");

console.log(`AI Hub configuration verified for ${config.name} (${config.chainId}).`);
console.log(`ChainRegistry: ${deployment.contracts.ChainRegistry}`);
console.log(`EVM adapter:   ${adapterAddress}`);
console.log(`Reporter:      ${deployment.contracts.ActivityReporter}`);
