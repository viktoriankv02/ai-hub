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

function receiptTxHashes(receipt: ExecutionReceipt): string[] {
  const hashes = receipt.txHashes?.filter(Boolean) ?? [];
  if (hashes.length > 0) return [...new Set(hashes)];
  return receipt.txHash ? [receipt.txHash] : [];
}

function aggregateConfirmationStatus(statuses: ExecutionReceiptStatus[]): "confirmed" | "failed" | "unknown" {
  if (statuses.length === 0) return "unknown";
  if (statuses.every((status) => status === "confirmed")) return "confirmed";
  if (statuses.every((status) => status === "failed")) return "failed";
  return "unknown";
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

    const hashes = receiptTxHashes(receipt);
    if (hashes.length === 0) {
      throw new Error(`submitted execution receipt has no transaction hash: ${idempotencyKey}`);
    }

    const results = await Promise.all(hashes.map(async (txHash) => {
      const result = await confirmer.confirm(txHash);
      return {
        txHash: result.txHash ?? txHash,
        status: result.status,
        note: result.note,
      };
    }));

    const status = aggregateConfirmationStatus(results.map((result) => result.status));
    const notes = results
      .map((result) => `${result.txHash}: ${result.status}${result.note ? ` (${result.note})` : ""}`)
      .join("; ");

    return this.receipts.reconcile(idempotencyKey, status, timestamp, {
      txHash: results[results.length - 1]?.txHash ?? receipt.txHash,
      txHashes: results.map((result) => result.txHash),
      note: notes,
    });
  }
}
