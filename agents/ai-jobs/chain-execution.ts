import type { AIJobRecord } from "./types.js";

export type AIJobChainFamily = "evm" | "sui";

export interface AIJobChainTarget {
  id: string;
  name: string;
  family: AIJobChainFamily;
  chainId: number;
  rpcUrl?: string;
  enabled: boolean;
  engineAddress?: string;
  rewardTokenAddress?: string;
  completionReporterAddress?: string;
  activityType?: string;
  projectId?: string;
  metadataHash?: string;
}

export interface ChainExecutionResult {
  target: AIJobChainTarget;
  jobId: string;
  onchainJobId?: string;
  provisionTransactionId?: string;
  completionTransactionId?: string;
  rewardTransactionId?: string;
  status: "planned" | "provisioned" | "completed" | "settled";
  reused: boolean;
}

export interface AIJobChainExecutionAdapter {
  readonly target: AIJobChainTarget;
  canExecute(job: AIJobRecord): Promise<boolean> | boolean;
  provision(job: AIJobRecord): Promise<ChainExecutionResult>;
  complete(job: AIJobRecord): Promise<ChainExecutionResult>;
  execute(job: AIJobRecord): Promise<ChainExecutionResult>;
}

export class ChainExecutionRegistry {
  private readonly adapters = new Map<string, AIJobChainExecutionAdapter>();

  register(adapter: AIJobChainExecutionAdapter): void {
    if (!adapter.target.id.trim()) throw new Error("chain target id is required");
    if (this.adapters.has(adapter.target.id)) {
      throw new Error(`chain target '${adapter.target.id}' is already registered`);
    }
    this.adapters.set(adapter.target.id, adapter);
  }

  replace(adapter: AIJobChainExecutionAdapter): void {
    if (!adapter.target.id.trim()) throw new Error("chain target id is required");
    this.adapters.set(adapter.target.id, adapter);
  }

  get(targetId: string): AIJobChainExecutionAdapter | undefined {
    return this.adapters.get(targetId);
  }

  require(targetId: string): AIJobChainExecutionAdapter {
    const adapter = this.get(targetId);
    if (!adapter) throw new Error(`chain target '${targetId}' is not registered`);
    if (!adapter.target.enabled) throw new Error(`chain target '${targetId}' is disabled`);
    return adapter;
  }

  list(): AIJobChainTarget[] {
    return [...this.adapters.values()].map((adapter) => ({ ...adapter.target }));
  }
}

export function selectChainTarget(
  registry: ChainExecutionRegistry,
  preferredTarget: string | undefined,
): AIJobChainExecutionAdapter {
  if (preferredTarget?.trim()) return registry.require(preferredTarget.trim());

  const firstEnabled = registry.list().find((target) => target.enabled);
  if (!firstEnabled) throw new Error("no enabled AI job chain target is configured");
  return registry.require(firstEnabled.id);
}
