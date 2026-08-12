import { JsonRpcProvider, Wallet } from "ethers";
import { resolve } from "node:path";
import { OnchainCompletionCoordinator } from "./onchain-completion-coordinator.js";
import { EVMCompletionSink } from "./evm-completion-sink.js";
import { JsonOnchainJobBindingStore } from "./onchain-job-bindings.js";
import { OnchainJobProvisioner } from "./onchain-job-provisioner.js";

export interface EVMOnchainRuntimeOptions {
  rpcUrl: string;
  privateKey: string;
  assignmentPrivateKey?: string;
  engineAddress: string;
  rewardTokenAddress: string;
  completionReporterAddress: string;
  bindingStorePath?: string;
  autoAssign?: boolean;
  activityType?: string;
  projectId?: string;
  metadataHash?: string;
  agentIdMap?: Record<string, string>;
}
export interface EVMOnchainRuntime { provider: JsonRpcProvider; signer: Wallet; assignmentSigner: Wallet; provisioner: OnchainJobProvisioner; coordinator: OnchainCompletionCoordinator; }
function required(value: string | undefined, name: string): string { if (!value?.trim()) throw new Error(`${name} is required`); return value.trim(); }

export function createEVMOnchainRuntime(options: EVMOnchainRuntimeOptions): EVMOnchainRuntime {
  const rpcUrl = required(options.rpcUrl, "rpcUrl");
  const privateKey = required(options.privateKey, "privateKey");
  const provider = new JsonRpcProvider(rpcUrl);
  const signer = new Wallet(privateKey, provider);
  const assignmentSigner = new Wallet(options.assignmentPrivateKey?.trim() || privateKey, provider);
  const engineAddress = required(options.engineAddress, "engineAddress");
  const rewardTokenAddress = required(options.rewardTokenAddress, "rewardTokenAddress");
  const completionReporterAddress = required(options.completionReporterAddress, "completionReporterAddress");
  const agentMap = options.agentIdMap ?? {};
  const bindings = new JsonOnchainJobBindingStore(resolve(options.bindingStorePath ?? "./data/onchain-job-bindings.json"));

  const resolveAgentId = async (agentId: string): Promise<bigint> => {
    const mapped = agentMap[agentId] ?? agentId;
    try { const value = BigInt(mapped); if (value > 0n) return value; } catch {}
    throw new Error(`cannot resolve off-chain agentId '${agentId}' to a positive on-chain agent id`);
  };

  const provisioner = new OnchainJobProvisioner({
    signer,
    assignmentSigner,
    engineAddress,
    rewardTokenAddress,
    bindings,
    resolveAgentId,
    autoAssign: options.autoAssign ?? true,
  });

  const sink = new EVMCompletionSink({
    signer,
    reporterAddress: completionReporterAddress,
    activityType: options.activityType ?? "AI_JOB_COMPLETED",
    projectId: options.projectId,
    metadataHash: options.metadataHash,
    resolveOnchainJobId: (offchainJobId) => provisioner.resolveOnchainJobId(offchainJobId),
  });
  const coordinator = new OnchainCompletionCoordinator({ provisioner, sink, attestationSigner: signer });
  return { provider, signer, assignmentSigner, provisioner, coordinator };
}
