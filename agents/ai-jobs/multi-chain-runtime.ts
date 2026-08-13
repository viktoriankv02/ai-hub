import { resolve } from "node:path";
import { createEVMOnchainRuntime, type EVMOnchainRuntime, type EVMOnchainRuntimeOptions } from "./onchain-runtime.js";
import { EVMChainExecutionAdapter } from "./evm-chain-execution.js";
import { ChainExecutionRegistry, type AIJobChainTarget, type AIJobChainExecutionAdapter } from "./chain-execution.js";
import type { AIJobRecord } from "./types.js";

export interface MultiChainEVMTarget extends AIJobChainTarget {
  family: "evm";
  rpcUrl: string;
  privateKey: string;
  assignmentPrivateKey?: string;
  payoutPrivateKey?: string;
  engineAddress: string;
  rewardTokenAddress: string;
  completionReporterAddress: string;
  bindingStorePath?: string;
  completionStorePath?: string;
  autoAssign?: boolean;
  autoSettleReward?: boolean;
  agentIdMap?: Record<string, string>;
}

export interface MultiChainRuntimeOptions {
  targets: MultiChainEVMTarget[];
  defaultTarget?: string;
}

export interface MultiChainRuntime {
  registry: ChainExecutionRegistry;
  runtimes: Map<string, EVMOnchainRuntime>;
  defaultTarget?: string;
}

function requireTarget(target: MultiChainEVMTarget): void {
  if (!target.id.trim()) throw new Error("chain target id is required");
  if (!target.name.trim()) throw new Error(`chain target '${target.id}' must have a name`);
  if (!Number.isSafeInteger(target.chainId) || target.chainId <= 0) {
    throw new Error(`chain target '${target.id}' must have a positive chainId`);
  }
  if (!target.rpcUrl.trim()) throw new Error(`chain target '${target.id}' requires rpcUrl`);
  if (!target.privateKey.trim()) throw new Error(`chain target '${target.id}' requires privateKey`);
}

function buildRuntime(target: MultiChainEVMTarget): EVMOnchainRuntime {
  const options: EVMOnchainRuntimeOptions = {
    rpcUrl: target.rpcUrl,
    privateKey: target.privateKey,
    assignmentPrivateKey: target.assignmentPrivateKey,
    payoutPrivateKey: target.payoutPrivateKey,
    engineAddress: target.engineAddress,
    rewardTokenAddress: target.rewardTokenAddress,
    completionReporterAddress: target.completionReporterAddress,
    bindingStorePath: target.bindingStorePath ?? `./data/onchain/${target.id}/bindings.json`,
    autoAssign: target.autoAssign ?? true,
    autoSettleReward: target.autoSettleReward ?? false,
    activityType: target.activityType ?? "AI_JOB_COMPLETED",
    projectId: target.projectId,
    metadataHash: target.metadataHash,
    agentIdMap: target.agentIdMap,
  };
  return createEVMOnchainRuntime(options);
}

export function createMultiChainRuntime(options: MultiChainRuntimeOptions): MultiChainRuntime {
  const registry = new ChainExecutionRegistry();
  const runtimes = new Map<string, EVMOnchainRuntime>();

  for (const target of options.targets) {
    requireTarget(target);
    const runtime = buildRuntime(target);
    const adapter = new EVMChainExecutionAdapter({ target, coordinator: runtime.coordinator });
    registry.register(adapter);
    runtimes.set(target.id, runtime);
  }

  const enabled = registry.list().filter((target) => target.enabled);
  const defaultTarget = options.defaultTarget ?? enabled[0]?.id;
  if (defaultTarget) registry.require(defaultTarget);

  return { registry, runtimes, defaultTarget };
}

export class AIJobMultiChainExecutor {
  constructor(private readonly runtime: MultiChainRuntime) {}

  targets(): AIJobChainTarget[] {
    return this.runtime.registry.list();
  }

  target(targetId?: string): AIJobChainExecutionAdapter {
    const id = targetId?.trim() || this.runtime.defaultTarget;
    if (!id) throw new Error("no default AI job chain target is configured");
    return this.runtime.registry.require(id);
  }

  async provision(job: AIJobRecord, targetId?: string) {
    return this.target(targetId).provision(job);
  }

  async complete(job: AIJobRecord, targetId?: string) {
    return this.target(targetId).complete(job);
  }

  async execute(job: AIJobRecord, targetId?: string) {
    return this.target(targetId).execute(job);
  }
}

export function defaultMultiChainTargetsFromEnv(): MultiChainEVMTarget[] {
  const json = process.env.AI_JOB_CHAIN_TARGETS_JSON?.trim();
  if (json) {
    const parsed = JSON.parse(json) as MultiChainEVMTarget[];
    if (!Array.isArray(parsed)) throw new Error("AI_JOB_CHAIN_TARGETS_JSON must be an array");
    return parsed.map((target) => ({
      ...target,
      bindingStorePath: target.bindingStorePath ? resolve(target.bindingStorePath) : undefined,
      completionStorePath: target.completionStorePath ? resolve(target.completionStorePath) : undefined,
    }));
  }

  const targets: MultiChainEVMTarget[] = [];
  const add = (id: string, name: string, prefix: string, chainId: number) => {
    const rpcUrl = process.env[`${prefix}_RPC_URL`]?.trim();
    const engineAddress = process.env[`${prefix}_AI_AGENT_ENGINE_ADDRESS`]?.trim() ?? process.env.AI_AGENT_ENGINE_ADDRESS?.trim();
    const rewardTokenAddress = process.env[`${prefix}_AI_REWARD_TOKEN_ADDRESS`]?.trim() ?? process.env.AI_REWARD_TOKEN_ADDRESS?.trim();
    const reporterAddress = process.env[`${prefix}_AI_COMPLETION_REPORTER_ADDRESS`]?.trim() ?? process.env.AI_COMPLETION_REPORTER_ADDRESS?.trim();
    const privateKey = process.env[`${prefix}_PRIVATE_KEY`]?.trim() ?? process.env.AI_JOB_PRIVATE_KEY?.trim();
    if (!rpcUrl || !engineAddress || !rewardTokenAddress || !reporterAddress || !privateKey) return;
    targets.push({
      id,
      name,
      family: "evm",
      chainId,
      rpcUrl,
      privateKey,
      assignmentPrivateKey: process.env[`${prefix}_ASSIGNMENT_PRIVATE_KEY`] ?? process.env.AI_JOB_ASSIGNMENT_PRIVATE_KEY,
      payoutPrivateKey: process.env[`${prefix}_PAYOUT_PRIVATE_KEY`] ?? process.env.AI_JOB_PAYOUT_PRIVATE_KEY,
      engineAddress,
      rewardTokenAddress,
      completionReporterAddress: reporterAddress,
      bindingStorePath: `./data/onchain/${id}/bindings.json`,
      completionStorePath: `./data/onchain/${id}/completions.json`,
      autoAssign: process.env.AI_JOB_AUTO_ASSIGN !== "0",
      autoSettleReward: process.env.AI_JOB_AUTO_SETTLE_REWARD === "true",
      activityType: process.env.AI_JOB_ACTIVITY_TYPE ?? "AI_JOB_COMPLETED",
      projectId: process.env.AI_JOB_PROJECT_ID,
      metadataHash: process.env.AI_JOB_METADATA_HASH,
      agentIdMap: process.env.AI_AGENT_ID_MAP_JSON ? JSON.parse(process.env.AI_AGENT_ID_MAP_JSON) : {},
      enabled: true,
    });
  };

  add("base-sepolia", "Base Sepolia", "BASE_SEPOLIA", 84532);
  add("ink-sepolia", "Ink Sepolia", "INK_SEPOLIA", 763373);
  add("arc-testnet", "Arc Testnet", "ARC_TESTNET", 5042002);
  add("tempo-testnet", "Tempo Testnet", "TEMPO_TESTNET", 42431);
  add("plasma-testnet", "Plasma Testnet", "PLASMA_TESTNET", 9746);
  return targets;
}
