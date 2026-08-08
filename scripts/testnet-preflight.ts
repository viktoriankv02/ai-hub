import "dotenv/config";
import { JsonRpcProvider, Wallet } from "ethers";
import { EVM_NETWORKS } from "../deploy/config/networks";

const target = process.env.AI_HUB_NETWORK ?? "baseSepolia";
const config = EVM_NETWORKS[target];

if (!config) throw new Error(`Unknown AI_HUB_NETWORK: ${target}`);
if (!config.testnet) throw new Error(`Refusing non-testnet target: ${target}`);

const rpcUrl = process.env[config.rpcEnv];
if (!rpcUrl) throw new Error(`Missing ${config.rpcEnv}`);

const provider = new JsonRpcProvider(rpcUrl, config.chainId, { staticNetwork: true });
const network = await provider.getNetwork();
const block = await provider.getBlock("latest");

if (network.chainId !== BigInt(config.chainId)) {
  throw new Error(`RPC chain mismatch: expected ${config.chainId}, got ${network.chainId}`);
}

console.log(`Network: ${config.name}`);
console.log(`Chain ID: ${network.chainId}`);
console.log(`Latest block: ${block?.number ?? "unknown"}`);

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!privateKey) {
  console.log("DEPLOYER_PRIVATE_KEY is not set; RPC preflight passed, signer check skipped.");
  process.exit(0);
}

const wallet = new Wallet(privateKey, provider);
const address = await wallet.getAddress();
const balance = await provider.getBalance(address);

console.log(`Deployer: ${address}`);
console.log(`Balance: ${balance.toString()} wei`);

if (balance === 0n) {
  console.warn("WARNING: deployer has zero balance on this testnet.");
}

if (target === "arcTestnet") {
  console.log("Arc note: gas is paid in testnet USDC, so a native ETH balance is not the funding criterion.");
}

if (target === "tempoTestnet") {
  console.log("Tempo note: fees use TIP-20 stablecoins; fund the account with testnet stablecoins before deployment.");
}

if (target === "plasmaTestnet") {
  console.log("Plasma note: deployment transactions require testnet XPL for gas.");
}
