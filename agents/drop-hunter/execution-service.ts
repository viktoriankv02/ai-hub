import type { PlannedAction } from "./action-planner.js";
import type { ExecutionAdapterContext, ExecutionAdapterRegistry } from "./execution-adapter.js";
import { ExecutionGate, type ExecutionGateDecision } from "./execution-gate.js";
import { ExecutionReceiptStore } from "./execution-idempotency.js";
import { runApprovedActions, type ExecutionRun } from "./execution-runner.js";

export interface DropHunterExecutionServiceOptions {
  gate?: ExecutionGate;
  receipts?: ExecutionReceiptStore;
}

export interface ExecuteOpportunityActionRequest {
  opportunityId: string;
  action: PlannedAction;
  approval: ExecutionGateDecision;
  context: ExecutionAdapterContext;
  account?: string;
  payloadFingerprint?: string;
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
    this.gate = options.gate ?? new ExecutionGate();
    this.receipts = options.receipts ?? new ExecutionReceiptStore();
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
}
