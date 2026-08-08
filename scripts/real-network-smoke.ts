import "dotenv/config";
import { network } from "hardhat";
import { EVM_NETWORKS, getExplorerUrl } from "../deploy/config/networks";
import { requireEnv } from "../deploy/config/env";
import { loadDeployment } from "../deploy/utils/deployment";

const target = process.env.AI_HUB_NETWORK ?? "baseSepolia";
const config = EVM_NETWORKS[target];
if (!config) throw new Error(`Unknown AI_HUB_NETWORK: ${target}`);

const deployment = await loadDeployment(target);
const { ethers } = await network.connect();
const [signer] = await ethers.getSigners();

const admin = requireEnv("AI_HUB_ADMIN_ADDRESS");
const expected = admin.toLowerCase();
const actual = (await signer.getAddress()).toLowerCase();
if (actual !== expected) {
  throw new Error(`Signer/admin mismatch: signer=${actual} admin=${expected}`);
}

const chainId = Number((await ethers.provider.getNetwork()).chainId);
if (chainId !== config.chainId) {
  throw new Error(`Chain ID mismatch: connected=${chainId} expected=${config.chainId}`);
}

console.log(`AI Hub smoke: ${config.name} (${chainId})`);
console.log(`Signer: ${actual}`);
console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(actual))}`);

for (const [name, address] of Object.entries(deployment.contracts)) {
  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`${name} has no deployed bytecode at ${address}`);
  console.log(`${name}: ${address}`);
}

const chainRegistry = await ethers.getContractAt("ChainRegistry", deployment.contracts.ChainRegistry);
const supported = await chainRegistry.isSupported(config.chainId);
console.log(`ChainRegistry.isSupported(${config.chainId}): ${supported}`);

const explorer = getExplorerUrl(target);
if (explorer) console.log(`Explorer: ${explorer}`);

console.log("REAL NETWORK SMOKE PASSED");
