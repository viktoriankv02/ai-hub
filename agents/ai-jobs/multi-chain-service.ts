import type { AIJobRecord } from "./types.js";
import type { AIJobChainExecutionAdapter, AIJobChainTarget } from "./chain-execution.js";
import type { MultiChainRuntime } from "./multi-chain-runtime.js";

export class AIJobMultiChainService {
  constructor(private readonly runtime: MultiChainRuntime) {}

  targets(): AIJobChainTarget[] {
    return this.runtime.registry.list();
  }

  private adapter(targetId?: string): AIJobChainExecutionAdapter {
    return this.runtime.registry.require(targetId?.trim() || this.runtime.defaultTarget || "");
  }

  async provision(job: AIJobRecord, targetId?: string) {
    return this.adapter(targetId).provision(job);
  }

  async complete(job: AIJobRecord, targetId?: string) {
    return this.adapter(targetId).complete(job);
  }

  async execute(job: AIJobRecord, targetId?: string) {
    return this.adapter(targetId).execute(job);
  }
}
