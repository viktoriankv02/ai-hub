import "dotenv/config";
import { ethers } from "ethers";
import { loadDeployment } from "../deploy/utils/deployment.js";
import { EVM_NETWORKS } from "../deploy/config/networks.js";

const networkKey = process.env.AI_HUB_NETWORK?.trim() || "baseSepolia";
const config = EVM_NETWORKS[networkKey];
if (!config) throw new Error(`Unknown AI_HUB_NETWORK: ${networkKey}`);

const rpcUrl = process.env[config.rpcEnv];
if (!rpcUrl) throw new Error(`Missing ${config.rpcEnv}`);

const rawJobId = process.argv[2] ?? process.env.AI_COMPLETION_JOB_ID;
if (!rawJobId || !/^\d+$/.test(rawJobId)) {
  throw new Error("Usage: npm run ai-completion:status -- 1  (or set AI_COMPLETION_JOB_ID)");
}

const jobId = BigInt(rawJobId);
if (jobId < 1n) throw new Error("job id must be positive");

const deployment = await loadDeployment(networkKey);
const provider = new ethers.JsonRpcProvider(rpcUrl);
const network = await provider.getNetwork();
if (Number(network.chainId) !== config.chainId) throw new Error(`RPC chain mismatch: ${network.chainId} != ${config.chainId}`);

const address = (name: string): string => {
  const value = deployment.contracts[name];
  if (!value || !ethers.isAddress(value)) throw new Error(`Missing/invalid deployment address: ${name}`);
  return value;
};

const engine = new ethers.Contract(address("AIAgentEngine"), [
  "function jobs(uint256) view returns (uint256 id,address creator,uint256 agentId,bytes32 taskHash,uint256 reward,bool assigned,bool completed,uint256 createdAt,uint256 completedAt,bytes32 resultHash)",
  "function completionReporters(address) view returns (bool)",
], provider);
const runtime = new ethers.Contract(address("AIAgentRuntime"), [
  "function agentOwner(uint256) view returns (address)",
  "function agentStatus(uint256) view returns (uint8)",
  "function isAgentVerified(uint256) view returns (bool)",
  "function canExecute(uint256) view returns (bool)",
], provider);
const reporter = new ethers.Contract(address("AICompletionReporter"), [
  "function completionCallers(address) view returns (bool)",
  "function attesters(address) view returns (bool)",
], provider);

const job = await engine.jobs(jobId);
if (job.id !== jobId) throw new Error(`On-chain job ${jobId} does not exist`);
const agentId = BigInt(job.agentId);
const agentOwner = await runtime.agentOwner(agentId);
const reporterAddress = address("AICompletionReporter");
const completionCaller = process.env.AI_COMPLETION_CALLER_ADDRESS?.trim();
const attester = process.env.AI_COMPLETION_ATTESTER_ADDRESS?.trim();

console.log(JSON.stringify({
  network: config.name,
  chainId: config.chainId,
  deployment: networkKey,
  job: {
    id: job.id.toString(), creator: job.creator, agentId: agentId.toString(), taskHash: job.taskHash,
    reward: job.reward.toString(), assigned: job.assigned, completed: job.completed,
    createdAt: new Date(Number(job.createdAt) * 1000).toISOString(),
    completedAt: Number(job.completedAt) === 0 ? null : new Date(Number(job.completedAt) * 1000).toISOString(),
    resultHash: job.resultHash,
  },
  agent: {
    owner: agentOwner,
    status: Number(await runtime.agentStatus(agentId)),
    verified: await runtime.isAgentVerified(agentId),
    canExecute: await runtime.canExecute(agentId),
  },
  trustBoundary: {
    completionReporter: reporterAddress,
    engineAuthorizesReporter: await engine.completionReporters(reporterAddress),
    completionCaller: completionCaller && ethers.isAddress(completionCaller) ? await reporter.completionCallers(completionCaller) : null,
    attester: attester && ethers.isAddress(attester) ? await reporter.attesters(attester) : null,
  },
}, null, 2));
