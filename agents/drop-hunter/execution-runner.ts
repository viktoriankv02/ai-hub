import type { PlannedAction } from "./action-planner.js";
import type { ExecutionGateDecision } from "./execution-gate.js";
import type { ExecutionEvent } from "./execution-memory.js";

export interface ExecutionHandlerResult { status: "success" | "failed"; timestamp?: string; chainId?: number; txHash?: string; note?: string; }
export type ExecutionHandler = (action: PlannedAction) => ExecutionHandlerResult | Promise<ExecutionHandlerResult>;
export interface ExecutionRun { action: PlannedAction; decision: ExecutionGateDecision; event: ExecutionEvent; }
export interface ExecutionRunnerOptions { timestamp: string; chainId?: number; }

export async function runApprovedActions(actions: Array<{ action: PlannedAction; decision: ExecutionGateDecision }>, handlers: Record<string, ExecutionHandler>, options: ExecutionRunnerOptions): Promise<ExecutionRun[]> {
  const runs: ExecutionRun[] = [];
  for (const item of actions) {
    const { action, decision } = item;
    if (!decision.allowed) { runs.push({ action, decision, event: { actionId: action.id, status: "skipped", timestamp: options.timestamp, risk: action.risk, chainId: options.chainId, note: decision.reason } }); continue; }
    const handler = handlers[action.id];
    if (!handler) { runs.push({ action, decision, event: { actionId: action.id, status: "skipped", timestamp: options.timestamp, risk: action.risk, chainId: options.chainId, note: "no execution handler is registered for this action" } }); continue; }
    try { const result = await handler(action); runs.push({ action, decision, event: { actionId: action.id, status: result.status, timestamp: result.timestamp ?? options.timestamp, risk: action.risk, chainId: result.chainId ?? options.chainId, txHash: result.txHash, note: result.note } }); }
    catch (error) { runs.push({ action, decision, event: { actionId: action.id, status: "failed", timestamp: options.timestamp, risk: action.risk, chainId: options.chainId, note: error instanceof Error ? error.message : String(error) } }); }
  }
  return runs;
}
