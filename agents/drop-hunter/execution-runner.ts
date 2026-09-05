import type { PlannedAction } from "./action-planner.js";
import { ExecutionGate, type ExecutionGateDecision, type ExecutionGateRequest, type ExecutionMode } from "./execution-gate.js";
import type { ExecutionEvent } from "./execution-memory.js";
import { ExecutionReceiptStore, type ReceiptReservation } from "./execution-idempotency.js";

export interface ExecutionHandlerResult { status: "success" | "failed"; timestamp?: string; chainId?: number; txHash?: string; note?: string; }
export type ExecutionHandler = (action: PlannedAction) => ExecutionHandlerResult | Promise<ExecutionHandlerResult>;
export interface ExecutionRun { action: PlannedAction; decision: ExecutionGateDecision; event: ExecutionEvent; }
export interface ExecutionIdempotencyOptions {
  store: ExecutionReceiptStore;
  opportunityId: string;
  account?: string;
  payloadFingerprint?: string;
}
export interface ExecutionRunnerOptions {
  timestamp: string;
  chainId?: number;
  /** Re-evaluate the stored approval against the current execution context. */
  gate?: ExecutionGate;
  /** Defaults to execute whenever a gate is provided. */
  mode?: ExecutionMode;
  walletConnected?: boolean;
  gasAvailable?: boolean;
  /** Opt-in idempotency reservation for externally side-effecting handlers. */
  idempotency?: ExecutionIdempotencyOptions;
}

function revalidateDecision(
  action: PlannedAction,
  decision: ExecutionGateDecision,
  options: ExecutionRunnerOptions,
): ExecutionGateDecision {
  if (!options.gate) return decision;

  const request: ExecutionGateRequest = {
    actionId: action.id,
    risk: action.risk,
    automated: action.automated,
    requiresWallet: action.requiresWallet,
    requiresGas: action.requiresGas,
    mode: options.mode ?? "execute",
    approved: decision.allowed,
    walletConnected: options.walletConnected,
    gasAvailable: options.gasAvailable,
  };

  return options.gate.revalidate(request);
}

function reservationNote(reservation: ReceiptReservation): string {
  const key = reservation.receipt.idempotencyKey.slice(0, 12);
  return `execution already reserved (${reservation.reason}; key ${key})`;
}

export async function runApprovedActions(actions: Array<{ action: PlannedAction; decision: ExecutionGateDecision }>, handlers: Record<string, ExecutionHandler>, options: ExecutionRunnerOptions): Promise<ExecutionRun[]> {
  const runs: ExecutionRun[] = [];
  for (const item of actions) {
    const { action } = item;
    const decision = revalidateDecision(action, item.decision, options);
    if (!decision.allowed) { runs.push({ action, decision, event: { actionId: action.id, status: "skipped", timestamp: options.timestamp, risk: action.risk, chainId: options.chainId, note: decision.reason } }); continue; }
    const handler = handlers[action.id];
    if (!handler) { runs.push({ action, decision, event: { actionId: action.id, status: "skipped", timestamp: options.timestamp, risk: action.risk, chainId: options.chainId, note: "no execution handler is registered for this action" } }); continue; }

    let reservation: ReturnType<ExecutionReceiptStore["reserve"]> | undefined;
    if (options.idempotency) {
      if (!options.idempotency.opportunityId.trim()) {
        const idempotencyDecision: ExecutionGateDecision = {
          allowed: false,
          requiresConfirmation: false,
          reason: "idempotency opportunityId is required",
        };
        runs.push({ action, decision: idempotencyDecision, event: { actionId: action.id, status: "skipped", timestamp: options.timestamp, risk: action.risk, chainId: options.chainId, note: idempotencyDecision.reason } });
        continue;
      }

      reservation = options.idempotency.store.reserve({
        opportunityId: options.idempotency.opportunityId,
        actionId: action.id,
        chainId: options.chainId,
        account: options.idempotency.account,
        payloadFingerprint: options.idempotency.payloadFingerprint,
      }, options.timestamp);

      if (!reservation.reserved) {
        runs.push({ action, decision, event: { actionId: action.id, status: "skipped", timestamp: options.timestamp, risk: action.risk, chainId: options.chainId, note: reservationNote(reservation) } });
        continue;
      }
    }

    try {
      const result = await handler(action);
      if (reservation) {
        if (result.txHash) {
          options.idempotency!.store.markSubmitted(
            reservation.receipt.idempotencyKey,
            result.timestamp ?? options.timestamp,
            result.txHash,
            result.note,
          );
        } else if (result.status === "failed") {
          options.idempotency!.store.markFailed(
            reservation.receipt.idempotencyKey,
            result.timestamp ?? options.timestamp,
            result.note,
          );
        } else {
          options.idempotency!.store.markUnknown(
            reservation.receipt.idempotencyKey,
            result.timestamp ?? options.timestamp,
            "handler reported success without a transaction hash; reconciliation is required before retry",
          );
        }
      }

      runs.push({ action, decision, event: { actionId: action.id, status: result.status, timestamp: result.timestamp ?? options.timestamp, risk: action.risk, chainId: result.chainId ?? options.chainId, txHash: result.txHash, note: result.note } });
    } catch (error) {
      if (reservation) {
        options.idempotency!.store.markFailed(
          reservation.receipt.idempotencyKey,
          options.timestamp,
          error instanceof Error ? error.message : String(error),
        );
      }
      runs.push({ action, decision, event: { actionId: action.id, status: "failed", timestamp: options.timestamp, risk: action.risk, chainId: options.chainId, note: error instanceof Error ? error.message : String(error) } });
    }
  }
  return runs;
}
