import type { ChainConfig } from "../../config/chains.js";
import type {
  ChainExecutionContext,
  MultiChainExecutionAdapter,
  UniversalAction,
  UniversalActionRouterOptions,
  UniversalExecutionResult,
} from "./types.js";

export class UniversalActionRouter {
  private readonly adapters = new Map<string, MultiChainExecutionAdapter>();
  private readonly completedByIdempotencyKey = new Map<string, UniversalExecutionResult>();
  private readonly now: () => Date;
  private readonly idempotencyEnabled: boolean;

  constructor(
    private readonly chains: readonly ChainConfig[],
    options: UniversalActionRouterOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.idempotencyEnabled = options.idempotency ?? true;
  }

  registerAdapter(adapter: MultiChainExecutionAdapter): void {
    if (!adapter.id.trim()) throw new Error("multi-chain adapter id cannot be empty");
    if (adapter.chainKeys.size === 0) throw new Error(`adapter ${adapter.id} must support at least one chain`);
    if (this.adapters.has(adapter.id)) throw new Error(`multi-chain adapter already registered: ${adapter.id}`);
    for (const chainKey of adapter.chainKeys) {
      if (!this.getChain(chainKey)) throw new Error(`adapter ${adapter.id} references unknown chain: ${chainKey}`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  unregisterAdapter(adapterId: string): boolean {
    return this.adapters.delete(adapterId);
  }

  listAdapters(): MultiChainExecutionAdapter[] {
    return [...this.adapters.values()];
  }

  listChains(): readonly ChainConfig[] {
    return this.chains;
  }

  getChain(chainKey: string): ChainConfig | undefined {
    return this.chains.find((chain) => chain.key === chainKey);
  }

  resolveAdapter(action: UniversalAction): MultiChainExecutionAdapter | undefined {
    return [...this.adapters.values()].find(
      (adapter) => adapter.chainKeys.has(action.chainKey) && adapter.supports(action),
    );
  }

  async execute(
    action: UniversalAction,
    contextOverrides: Partial<Omit<ChainExecutionContext, "chainKey" | "timestamp">> = {},
  ): Promise<UniversalExecutionResult> {
    const chain = this.getChain(action.chainKey);
    const timestamp = this.now().toISOString();

    if (!chain) return this.fail(action, action.chainKey, timestamp, `unknown chain: ${action.chainKey}`);

    const context: ChainExecutionContext = {
      mode: contextOverrides.mode ?? "dry-run",
      timestamp,
      chainKey: chain.key,
      chainId: chain.chainId,
      walletConnected: contextOverrides.walletConnected,
      walletAddress: contextOverrides.walletAddress,
      gasAvailable: contextOverrides.gasAvailable,
      metadata: contextOverrides.metadata,
    };

    const validation = this.validateAction(action, context, chain);
    if (validation) return validation;

    const idempotencyKey = action.idempotencyKey?.trim();
    if (this.idempotencyEnabled && idempotencyKey) {
      const previous = this.completedByIdempotencyKey.get(idempotencyKey);
      if (previous) return { ...previous, status: "skipped", note: "idempotent action already completed" };
    }

    const adapter = this.resolveAdapter(action);
    if (!adapter) {
      return this.fail(action, action.chainKey, timestamp, `no adapter supports action ${action.kind} on ${action.chainKey}`);
    }

    if (context.mode === "dry-run") {
      return {
        status: "skipped",
        actionId: action.id,
        chainKey: action.chainKey,
        timestamp,
        note: `dry-run: resolved adapter ${adapter.id}; no external side effect executed`,
        data: { adapterId: adapter.id, mode: context.mode },
      };
    }

    if (context.mode === "simulate") {
      return {
        status: "skipped",
        actionId: action.id,
        chainKey: action.chainKey,
        timestamp,
        note: `simulate: resolved adapter ${adapter.id}; simulation must be supplied by the adapter without external side effects`,
        data: { adapterId: adapter.id, mode: context.mode },
      };
    }

    const result = await adapter.execute(action, context);
    if (idempotencyKey && result.status === "success") this.completedByIdempotencyKey.set(idempotencyKey, result);
    return result;
  }

  clearIdempotencyKey(idempotencyKey: string): boolean {
    return this.completedByIdempotencyKey.delete(idempotencyKey);
  }

  clearIdempotency(): void {
    this.completedByIdempotencyKey.clear();
  }

  private validateAction(
    action: UniversalAction,
    context: ChainExecutionContext,
    chain: ChainConfig,
  ): UniversalExecutionResult | undefined {
    if (!action.id.trim()) return this.fail(action, chain.key, context.timestamp, "action id cannot be empty");
    if (!action.kind) return this.fail(action, chain.key, context.timestamp, "action kind is required");
    if (!action.chainKey.trim()) return this.fail(action, chain.key, context.timestamp, "action chainKey cannot be empty");

    if (!chain.enabled) return this.fail(action, chain.key, context.timestamp, `chain is disabled: ${chain.key}`);
    if (action.requiresWallet && !context.walletConnected) return this.fail(action, chain.key, context.timestamp, "wallet connection is required");
    if (action.requiresWallet && !context.walletAddress) return this.fail(action, chain.key, context.timestamp, "wallet address is required");
    if (action.requiresGas && !context.gasAvailable) return this.fail(action, chain.key, context.timestamp, "gas availability is required");

    return undefined;
  }

  private fail(
    action: UniversalAction,
    chainKey: string,
    timestamp: string,
    note: string,
  ): UniversalExecutionResult {
    return { status: "failed", actionId: action.id, chainKey, timestamp, note };
  }
}
