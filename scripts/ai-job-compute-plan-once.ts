import "dotenv/config";
import { rankComputeNodes } from "../agents/ai-jobs/compute-node-selector.js";
import { EVMComputeNodeRegistryClient } from "../agents/ai-jobs/evm-compute-node-registry.js";

const rpcUrl = process.env.AI_JOB_RPC_URL?.trim() || process.env.BASE_SEPOLIA_RPC_URL?.trim();
const registryAddress = process.env.AI_COMPUTE_NODE_REGISTRY_ADDRESS?.trim();

if (!rpcUrl) throw new Error("AI_JOB_RPC_URL or BASE_SEPOLIA_RPC_URL is required");
if (!registryAddress) throw new Error("AI_COMPUTE_NODE_REGISTRY_ADDRESS is required");

const nodes = await new EVMComputeNodeRegistryClient({ rpcUrl, registryAddress }).listNodes();
const preferredGpuModels = (process.env.AI_COMPUTE_PREFERRED_GPU_MODELS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const ranked = rankComputeNodes(nodes, {
  region: process.env.AI_COMPUTE_REGION,
  minGpuMemory: process.env.AI_COMPUTE_MIN_GPU_MEMORY ? Number(process.env.AI_COMPUTE_MIN_GPU_MEMORY) : undefined,
  minCpuCores: process.env.AI_COMPUTE_MIN_CPU_CORES ? Number(process.env.AI_COMPUTE_MIN_CPU_CORES) : undefined,
  minRam: process.env.AI_COMPUTE_MIN_RAM ? Number(process.env.AI_COMPUTE_MIN_RAM) : undefined,
  preferredGpuModels,
  maxHeartbeatAgeSeconds: process.env.AI_COMPUTE_MAX_HEARTBEAT_AGE_SECONDS
    ? Number(process.env.AI_COMPUTE_MAX_HEARTBEAT_AGE_SECONDS)
    : undefined,
});

console.log(JSON.stringify({
  registryAddress,
  nodeCount: nodes.length,
  selected: ranked[0] ?? null,
  ranked,
}, null, 2));
