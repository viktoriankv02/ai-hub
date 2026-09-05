import type { PlannedAction } from "./action-planner.js";
import { ExecutionGate, type ExecutionGateDecision, type ExecutionGateRequest, type ExecutionMode } from "./execution-gate.js";
import type { ExecutionEvent } from "./execution-memory.js";

export interface ExecutionHandlerResult { status: "success" | "failed"; timestamp?: string; chainId?: number; txHash?: string; note?: string; }
export type ExecutionHandler = (action: PlannedAction) => ExecutionHandlerResult | Promise<ExecutionHandlerResult>;
export interface ExecutionRun { action: PlannedAction; decision: ExecutionGateDecision; event: ExecutionEvent; }
export interface ExecutionRunnerOptions {
  timestamp: string;
  chainId?: number;
  /** Re-evaluate the stored approval against the current execution context. */
  gate?: ExecutionGate;
  /** Defaults to execute whenever a gate is provided. */
  mode?: ExecutionMode;
  walletConnected?: boolean;
  gasAvailable?: boolean;
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

export async function runApprovedActions(actions: Array<{ action: PlannedAction; decision: ExecutionGateDecision }>, handlers: Record<string, ExecutionHandler>, options: ExecutionRunnerOptions): Promise<ExecutionRun[]> {
  const runs: ExecutionRun[] = [];
  for (const item of actions) {
    const { action } = item;
    const decision = revalidateDecision(action, item.decision, options);
    if (!decision.allowed) { runs.push({ action, decision, event: { actionId: action.id, status: "skipped", timestamp: options.timestamp, risk: action.risk, chainId: options.chainId, note: decision.reason } }); continue; }
    const handler = handlers[action.id];
    if (!handler) { runs.push({ action, decision, event: { actionId: action.id, status: "skipped", timestamp: options.timestamp, risk: action.risk, chainId: options.chainId, note: "no execution handler is registered for this action" } }); continue; }
    try { const result = await handler(action); runs.push({ action, decision, event: { actionId: action.id, status: result.status, timestamp: result.timestamp ?? options.timestamp, risk: action.risk, chainId: result.chainId ?? options.chainId, txHash: result.txHash, note: result.note } }); }
    catch (error) { runs.push({ action, decision, event: { actionId: action.id, status: "failed", timestamp: options.timestamp, risk: action.risk, chainId: options.chainId, note: error instanceof Error ? error.message : String(error) } }); }
  }
  return runs;
}
