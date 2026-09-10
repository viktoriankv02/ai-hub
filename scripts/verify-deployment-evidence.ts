import "dotenv/config";
import { JsonRpcProvider, Wallet } from "ethers";
import { EVM_NETWORKS } from "../deploy/config/networks";
import {
  assertAddress,
  loadDeployment,
  validateDeploymentRecord,
} from "../deploy/utils/deployment";

const target = process.env.AI_HUB_NETWORK ?? "baseSepolia";
const config = EVM_NETWORKS[target];
if (!config) throw new Error(`Unknown AI_HUB_NETWORK: ${target}`);

const record = await loadDeployment(target);
validateDeploymentRecord(record, target, config.chainId);

const configuredRpc = process.env[config.rpcEnv]?.trim();
const fallbackRpc = target === "baseSepolia"
  ? "https://sepolia.base.org"
  : target === "base"
    ? "https://mainnet.base.org"
    : undefined;

const rpcCandidates = [...new Set(
  [configuredRpc, fallbackRpc].filter((value): value is string => Boolean(value)),
)];

if (rpcCandidates.length === 0) {
  throw new Error(`Missing ${config.rpcEnv}`);
}

let provider: JsonRpcProvider | undefined;
let rpcUrl = "";
let lastError: unknown;

for (const candidate of rpcCandidates) {
  const candidateProvider = new JsonRpcProvider(
    candidate,
    config.chainId,
    { staticNetwork: true },
  );

  try {
    const network = await candidateProvider.getNetwork();
    if (network.chainId !== BigInt(config.chainId)) {
      throw new Error(`RPC chain mismatch: expected ${config.chainId}, got ${network.chainId}`);
    }
    await candidateProvider.getBlockNumber();
    provider = candidateProvider;
    rpcUrl = candidate;

    if (candidate !== configuredRpc && configuredRpc) {
      console.warn(`Configured RPC failed; using Base fallback RPC: ${candidate}`);
    }
    break;
  } catch (error) {
    lastError = error;
  }
}

if (!provider) {
  throw new Error(
    `Unable to reach ${config.name} RPC (${rpcCandidates.join(", ")}): ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

const entries = Object.entries(record.contracts).map(([name, address]) => ({
  name,
  address: assertAddress(name, address),
}));

const missingCode: string[] = [];
for (const entry of entries) {
  const code = await provider.getCode(entry.address);
  if (code === "0x") missingCode.push(`${entry.name}=${entry.address}`);
}

if (missingCode.length > 0) {
  throw new Error(`Deployment manifest contains addresses without contract code: ${missingCode.join(", ")}`);
}

const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
let deployer: string | undefined;
if (privateKey) {
  deployer = await new Wallet(privateKey, provider).getAddress();
}

const minimum = 10;
console.log(`Deployment evidence: ${config.name} (${config.chainId})`);
console.log(`RPC: ${rpcUrl}`);
console.log(`Manifest: deployments/${target}.json`);
console.log(`Contract count: ${entries.length}`);
for (const entry of entries) console.log(`${entry.name}: ${entry.address}`);
if (deployer) console.log(`Deployer: ${deployer}`);

if (entries.length < minimum) {
  throw new Error(`Deployment evidence requires at least ${minimum} contracts; found ${entries.length}`);
}

console.log(`Deployment evidence verified: ${entries.length} contracts with on-chain bytecode.`);
