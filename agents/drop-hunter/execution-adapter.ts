import type { PlannedAction } from "./action-planner.js";
import type { ExecutionMode } from "./execution-gate.js";
import type { ExecutionHandlerResult } from "./execution-runner.js";

export interface ExecutionAdapterContext {
  mode: ExecutionMode;
  timestamp: string;
  chainId?: number;
  walletConnected?: boolean;
  walletAddress?: string;
  gasAvailable?: boolean;
}

export interface ExecutionAdapter {
  readonly id: string;
  supports(action: PlannedAction): boolean;
  execute(action: PlannedAction, context: ExecutionAdapterContext): ExecutionHandlerResult | Promise<ExecutionHandlerResult>;
}

export class ExecutionAdapterRegistry {
  private readonly adapters = new Map<string, ExecutionAdapter>();
  register(adapter: ExecutionAdapter): void { if (this.adapters.has(adapter.id)) throw new Error(`Execution adapter already registered: ${adapter.id}`); this.adapters.set(adapter.id, adapter); }
  unregister(adapterId: string): boolean { return this.adapters.delete(adapterId); }
  list(): ExecutionAdapter[] { return [...this.adapters.values()]; }
  resolve(action: PlannedAction): ExecutionAdapter | undefined { return [...this.adapters.values()].find((adapter) => adapter.supports(action)); }
  async execute(action: PlannedAction, context: ExecutionAdapterContext): Promise<ExecutionHandlerResult> {
    if (context.mode === "dry-run") return { status: "failed", timestamp: context.timestamp, chainId: context.chainId, note: "execution adapters are not invoked during dry-run" };
    const adapter = this.resolve(action);
    if (!adapter) return { status: "failed", timestamp: context.timestamp, chainId: context.chainId, note: `no execution adapter supports action: ${action.id}` };
    return adapter.execute(action, context);
  }
}

export class ActionExecutionAdapter implements ExecutionAdapter {
  readonly id: string;
  constructor(private readonly adapterId: string, private readonly actionIds: Iterable<string>, private readonly handler: (action: PlannedAction, context: ExecutionAdapterContext) => ExecutionHandlerResult | Promise<ExecutionHandlerResult>) { this.id = adapterId; }
  supports(action: PlannedAction): boolean { return new Set(this.actionIds).has(action.id); }
  execute(action: PlannedAction, context: ExecutionAdapterContext): ExecutionHandlerResult | Promise<ExecutionHandlerResult> { return this.handler(action, context); }
}
