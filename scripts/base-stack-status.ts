import { ethers } from "ethers";
import { loadDeployment } from "../deploy/utils/deployment.js";
import { EVM_NETWORKS } from "../deploy/config/networks.js";

const networkKey = process.env.AI_HUB_NETWORK?.trim() || "baseSepolia";
const config = EVM_NETWORKS[networkKey];
if (!config) throw new Error(`Unknown AI_HUB_NETWORK: ${networkKey}`);

const rpcUrl = process.env[config.rpcEnv];
if (!rpcUrl) throw new Error(`Missing ${config.rpcEnv}`);

const deployment = await loadDeployment(networkKey);
const provider = new ethers.JsonRpcProvider(rpcUrl);
const chain = await provider.getNetwork();

if (Number(chain.chainId) !== config.chainId) {
  throw new Error(`RPC chain mismatch: ${chain.chainId} != ${config.chainId}`);
}

const address = (name: string) => deployment.contracts[name];
const runtimeAbi = [
  "function nextAgentId() view returns (uint256)",
];
const engineAbi = [
  "function nextJobId() view returns (uint256)",
  "function completionReporters(address) view returns (bool)",
  "function payoutManagers(address) view returns (bool)",
];
const reporterAbi = [
  "function attesters(address) view returns (bool)",
];
const registryAbi = [
  "function totalActivities() view returns (uint256)",
  "function supportedActivityTypes(bytes32) view returns (bool)",
];
const chainRegistryAbi = [
  "function isSupported(uint256) view returns (bool)",
];

const runtime = new ethers.Contract(address("AIAgentRuntime"), runtimeAbi, provider);
const engine = new ethers.Contract(address("AIAgentEngine"), engineAbi, provider);
const completionReporter = new ethers.Contract(address("AICompletionReporter"), reporterAbi, provider);
const activityRegistry = new ethers.Contract(address("ActivityRegistry"), registryAbi, provider);
const chainRegistry = new ethers.Contract(address("ChainRegistry"), chainRegistryAbi, provider);

const activityType = ethers.id(process.env.AI_JOB_ACTIVITY_TYPE || "AI_JOB_COMPLETED");
const deployer = process.env.AI_HUB_ADMIN_ADDRESS?.trim();

console.log("AI Hub — Base stack status");
console.log(`Network: ${config.name}`);
console.log(`Chain ID: ${config.chainId}`);
console.log(`Deployment: ${networkKey}`);
console.log("");

for (const name of Object.keys(deployment.contracts)) {
  const value = address(name);
  if (!ethers.isAddress(value)) throw new Error(`Invalid deployment address: ${name}`);
  const code = await provider.getCode(value);
  console.log(`${name}: ${value} ${code === "0x" ? "MISSING CODE" : "OK"}`);
}

console.log("");
console.log(`Chain registered: ${await chainRegistry.isSupported(config.chainId)}`);
console.log(`Activity type enabled: ${await activityRegistry.supportedActivityTypes(activityType)}`);
console.log(`Total activities: ${(await activityRegistry.totalActivities()).toString()}`);
console.log(`Next agent ID: ${(await runtime.nextAgentId()).toString()}`);
console.log(`Next job ID: ${(await engine.nextJobId()).toString()}`);

if (deployer) {
  console.log(`Completion reporter authorized: ${await engine.completionReporters(address("AICompletionReporter"))}`);
  console.log(`Admin payout manager: ${await engine.payoutManagers(deployer)}`);
  console.log(`Admin attester: ${await completionReporter.attesters(deployer)}`);
}
