import type { AIJobRecord } from "./types.js";

export interface AIJobChainTarget {
  id: string;
  name: string;
  family: "evm";
  chainId: number;
  enabled: boolean;
  activityType?: string;
  projectId?: string;
  metadataHash?: string;
}

export interface AIJobChainExecutionAdapter {
  readonly target: AIJobChainTarget;
  provision(job: AIJobRecord): Promise<unknown>;
  complete(job: AIJobRecord): Promise<unknown>;
  execute(job: AIJobRecord): Promise<unknown>;
}

export class ChainExecutionRegistry {
  private readonly adapters = new Map<string, AIJobChainExecutionAdapter>();

  register(adapter: AIJobChainExecutionAdapter): void {
    const id = adapter.target.id.trim();
    if (!id) throw new Error("chain target id is required");
    if (this.adapters.has(id)) throw new Error(`chain target '${id}' is already registered`);
    this.adapters.set(id, adapter);
  }

  list(): AIJobChainTarget[] {
    return [...this.adapters.values()].map((adapter) => adapter.target);
  }

  require(id: string): AIJobChainExecutionAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`unknown AI job chain target '${id}'`);
    return adapter;
  }
}
