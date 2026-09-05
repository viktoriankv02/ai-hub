import type { PlannedAction } from "./action-planner.js";
import type { ExecutionAdapterContext, ExecutionAdapterRegistry } from "./execution-adapter.js";
import { ExecutionGate, type ExecutionGateDecision } from "./execution-gate.js";
import {
  ExecutionReceiptStore,
  JsonExecutionReceiptPersistence,
  type ExecutionReceipt,
  type ExecutionReceiptStatus,
} from "./execution-idempotency.js";
import { runApprovedActions, type ExecutionRun } from "./execution-runner.js";

export interface DropHunterExecutionServiceOptions {
  gate?: ExecutionGate;
  receipts?: ExecutionReceiptStore;
  receiptStoreFile?: string;
}

export interface ExecuteOpportunityActionRequest {
  opportunityId: string;
  action: PlannedAction;
  approval: ExecutionGateDecision;
  context: ExecutionAdapterContext;
  account?: string;
  payloadFingerprint?: string;
}

export interface ExecutionReceiptConfirmer {
  confirm(txHash: string): Promise<{
    status: Extract<ExecutionReceiptStatus, "confirmed" | "failed" | "unknown">;
    txHash?: string;
    note?: string;
  }>;
}

/**
 * Canonical Drop Hunter execution boundary.
 *
 * Callers provide a previously evaluated approval and a live execution
 * context. The runner revalidates the approval and reserves the action before
 * the adapter registry is allowed to perform an external side effect.
 */
export class DropHunterExecutionService {
  readonly gate: ExecutionGate;
  readonly receipts: ExecutionReceiptStore;

  constructor(
    private readonly adapters: ExecutionAdapterRegistry,
    options: DropHunterExecutionServiceOptions = {},
  ) {
    if (options.receipts && options.receiptStoreFile) {
      throw new Error("provide either receipts or receiptStoreFile, not both");
    }

    this.gate = options.gate ?? new ExecutionGate();
    this.receipts =
      options.receipts ??
      new ExecutionReceiptStore(
        options.receiptStoreFile
          ? new JsonExecutionReceiptPersistence(options.receiptStoreFile)
          : undefined,
      );
  }

  async executeOpportunityAction(
    request: ExecuteOpportunityActionRequest,
  ): Promise<ExecutionRun> {
    const [run] = await runApprovedActions(
      [{ action: request.action, decision: request.approval }],
      {
        [request.action.id]: (action) => this.adapters.execute(action, request.context),
      },
      {
        timestamp: request.context.timestamp,
        chainId: request.context.chainId,
        gate: this.gate,
        mode: request.context.mode,
        walletConnected: request.context.walletConnected,
        gasAvailable: request.context.gasAvailable,
        idempotency: {
          store: this.receipts,
          opportunityId: request.opportunityId,
          account: request.account ?? request.context.walletAddress,
          payloadFingerprint: request.payloadFingerprint,
        },
      },
    );

    if (!run) {
      throw new Error("execution service produced no execution result");
    }

    return run;
  }

  async reconcileSubmittedReceipt(
    idempotencyKey: string,
    timestamp: string,
    confirmer: ExecutionReceiptConfirmer,
  ): Promise<ExecutionReceipt> {
    const receipt = this.receipts.get(idempotencyKey);
    if (!receipt) {
      throw new Error(`Unknown execution receipt: ${idempotencyKey}`);
    }
    if (receipt.status !== "submitted") {
      return receipt;
    }
    if (!receipt.txHash) {
      throw new Error(`submitted execution receipt has no transaction hash: ${idempotencyKey}`);
    }

    const result = await confirmer.confirm(receipt.txHash);
    return this.receipts.reconcile(idempotencyKey, result.status, timestamp, {
      txHash: result.txHash ?? receipt.txHash,
      note: result.note,
    });
  }
}
