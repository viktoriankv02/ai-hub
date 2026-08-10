import type { ExecutionEvent } from "./execution-memory.js";
import type { ExecutionRetryPolicy, RetryDecision } from "./execution-retry.js";
import type { ExecutionReceipt } from "./execution-idempotency.js";
import type { EvmExecutionAdapter } from "./evm-execution-adapter.js";
import { DropHunterScheduler, type SchedulerCycle } from "./scheduler.js";
import { DropHunterService, type ServiceScanOptions } from "./service.js";

export interface RuntimeOrchestratorOptions {
  now?: () => string;
  retryPolicy?: Partial<ExecutionRetryPolicy>;
  onCycle?: (cycle: RuntimeCycle) => void | Promise<void>;
  onReconciliation?: (result: RuntimeReconciliation) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
}

export interface RuntimeReconciliation {
  idempotencyKey: string;
  opportunityId: string;
  actionId: string;
  status: ExecutionReceipt["status"];
  txHash?: string;
  note?: string;
}

export interface RuntimeCycle {
  timestamp: string;
  discovery: SchedulerCycle;
  reconciliations: RuntimeReconciliation[];
  retryPlans: RetryDecision[];
}

/**
 * Production process coordinator. Discovery/planning stays separate from
 * execution; submitted EVM transactions are reconciled without resubmission.
 */
export class DropHunterRuntimeOrchestrator {
  private readonly scheduler: DropHunterScheduler;
  private readonly adapters = new Map<number, EvmExecutionAdapter>();
  private lastCycle: RuntimeCycle | undefined;

  constructor(
    private readonly service: DropHunterService,
    scanOptions: Omit<ServiceScanOptions, "observedAt">,
    schedulerOptions: Omit<ConstructorParameters<typeof DropHunterScheduler>[2], "onCycle" | "onError" | "now"> & { intervalMs: number },
    private readonly options: RuntimeOrchestratorOptions = {},
  ) {
    this.scheduler = new DropHunterScheduler(service, scanOptions, {
      ...schedulerOptions,
      now: options.now,
      onCycle: async (discovery) => {
        this.lastCycle = await this.processDiscovery(discovery);
        await options.onCycle?.(this.lastCycle);
      },
      onError: options.onError,
    });
  }

  registerEvmAdapter(chainId: number, adapter: EvmExecutionAdapter): void {
    if (!Number.isInteger(chainId) || chainId <= 0) throw new Error("chain id must be a positive integer");
    if (this.adapters.has(chainId)) throw new Error(`EVM adapter already registered for chain ${chainId}`);
    this.adapters.set(chainId, adapter);
  }

  removeEvmAdapter(chainId: number): boolean { return this.adapters.delete(chainId); }
  get active(): boolean { return this.scheduler.active; }

  async tick(): Promise<RuntimeCycle> {
    await this.scheduler.tick();
    if (!this.lastCycle) throw new Error("scheduler completed without producing a runtime cycle");
    return this.lastCycle;
  }

  start(runImmediately = true): void { this.scheduler.start(runImmediately); }
  stop(): void { this.scheduler.stop(); }

  async reconcileSubmitted(timestamp = this.options.now?.() ?? new Date().toISOString()): Promise<RuntimeReconciliation[]> {
    const submitted = this.service.executionReceipts().list().filter((receipt) => receipt.status === "submitted" && receipt.txHash);
    const results: RuntimeReconciliation[] = [];
    for (const receipt of submitted) {
      if (receipt.chainId === undefined) continue;
      const adapter = this.adapters.get(receipt.chainId);
      if (!adapter) continue;
      const result = await this.service.reconcileEvmExecution({
        opportunityId: receipt.opportunityId,
        actionId: receipt.actionId,
        chainId: receipt.chainId,
        account: receipt.account,
      }, adapter, timestamp);
      const reconciliation: RuntimeReconciliation = {
        idempotencyKey: receipt.idempotencyKey,
        opportunityId: receipt.opportunityId,
        actionId: receipt.actionId,
        status: result.receipt.status,
        txHash: result.receipt.txHash,
        note: result.receipt.note,
      };
      results.push(reconciliation);
      await this.options.onReconciliation?.(reconciliation);
    }
    return results;
  }

  retryPlans(events: ExecutionEvent[]): RetryDecision[] {
    return this.service.retryPlans(events, this.options.retryPolicy);
  }

  receiptFor(opportunityId: string, actionId: string, chainId?: number, account?: string, payloadFingerprint?: string): ExecutionReceipt | undefined {
    return this.service.executionReceipt({ opportunityId, actionId, chainId, account, payloadFingerprint });
  }

  private async processDiscovery(discovery: SchedulerCycle): Promise<RuntimeCycle> {
    const reconciliations = await this.reconcileSubmitted(discovery.timestamp);
    return { timestamp: discovery.timestamp, discovery, reconciliations, retryPlans: [] };
  }
}
