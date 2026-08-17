import { Contract, JsonRpcProvider } from "ethers";
import type { ComputeNodeCandidate } from "./compute-node-selector.js";

const REGISTRY_ABI = [
  "function nodeCount() view returns (uint256)",
  "function getNode(uint256 nodeId) view returns (tuple(uint256 id,address owner,string endpoint,string gpuModel,uint32 gpuMemory,uint16 cpuCores,uint32 ram,string region,uint256 stake,uint256 reputation,uint256 completedJobs,uint256 failedJobs,uint256 lastHeartbeat,uint256 totalReward,uint256 activeJobs,uint8 status,bool exists))",
];

export interface EVMComputeNodeRegistryClientOptions {
  rpcUrl: string;
  registryAddress: string;
}

export class EVMComputeNodeRegistryClient {
  private readonly contract: Contract;

  constructor(options: EVMComputeNodeRegistryClientOptions) {
    if (!options.rpcUrl.trim()) throw new Error("rpcUrl is required");
    if (!options.registryAddress.trim()) throw new Error("registryAddress is required");
    const provider = new JsonRpcProvider(options.rpcUrl);
    this.contract = new Contract(options.registryAddress, REGISTRY_ABI, provider);
  }

  async listNodes(): Promise<ComputeNodeCandidate[]> {
    const count = Number(await this.contract.nodeCount());
    const nodes: ComputeNodeCandidate[] = [];

    for (let nodeId = 1; nodeId <= count; nodeId++) {
      const node = await this.contract.getNode(nodeId);
      nodes.push({
        id: node.id.toString(),
        gpuModel: node.gpuModel,
        gpuMemory: Number(node.gpuMemory),
        cpuCores: Number(node.cpuCores),
        ram: Number(node.ram),
        region: node.region,
        reputation: Number(node.reputation),
        completedJobs: Number(node.completedJobs),
        failedJobs: Number(node.failedJobs),
        lastHeartbeat: Number(node.lastHeartbeat),
        activeJobs: Number(node.activeJobs),
        online: Number(node.status) === 1,
      });
    }

    return nodes;
  }
}
