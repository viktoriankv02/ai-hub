import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";
import { loadDeployment } from "./utils/deployment";

const target = requireEnv("AI_HUB_NETWORK");
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

const admin = requireEnv("AI_HUB_ADMIN_ADDRESS");
const chainRegistry = await ethers.getContractAt("ChainRegistry", deployment.contracts.ChainRegistry);
const reporter = await ethers.getContractAt("ActivityReporter", deployment.contracts.ActivityReporter);
const adapterAddress = deployment.contracts.EVMChainAdapter;

if (!adapterAddress) throw new Error("Missing EVMChainAdapter in deployment artifact");

const chain = await chainRegistry.getChain(config.chainId);
if (chain.adapter.toLowerCase() !== adapterAddress.toLowerCase()) throw new Error("Registry adapter mismatch");
if (!chain.active) throw new Error("Registered chain is inactive");
if (!chain.testnet) throw new Error("Deployment target is not marked testnet");
if ((await chainRegistry.isSupported(config.chainId)) !== true) throw new Error("ChainRegistry does not support target chain");

const adapter = await ethers.getContractAt("EVMChainAdapter", adapterAddress);
if ((await adapter.chainId()) !== BigInt(config.chainId)) throw new Error("Adapter chainId mismatch");
if ((await adapter.isAvailable()) !== true) throw new Error("Adapter unavailable");

if ((await reporter.chainRegistry()).toLowerCase() !== deployment.contracts.ChainRegistry.toLowerCase()) {
  throw new Error("Reporter ChainRegistry mismatch");
}

if ((await chainRegistry.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("ChainRegistry owner mismatch");
if ((await reporter.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("ActivityReporter owner mismatch");
if ((await adapter.owner()).toLowerCase() !== admin.toLowerCase()) throw new Error("EVMChainAdapter owner mismatch");

console.log(`AI Hub configuration verified for ${config.name}.`);
console.log(`ChainRegistry: ${deployment.contracts.ChainRegistry}`);
console.log(`EVM adapter:   ${adapterAddress}`);
console.log(`Reporter:      ${deployment.contracts.ActivityReporter}`);
