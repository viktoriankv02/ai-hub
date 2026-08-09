import type { ExecutionRisk, UserExecutionProfile } from "./action-planner.js";

export type ExecutionStatus = "success" | "failed" | "skipped";

export interface ExecutionEvent {
  actionId: string;
  status: ExecutionStatus;
  timestamp: string;
  risk: ExecutionRisk;
  chainId?: number;
  txHash?: string;
  note?: string;
}

export interface LearnedExecutionProfile extends UserExecutionProfile {
  successfulActionIds: string[];
  failedActionIds: string[];
  skippedActionIds: string[];
  successRate: number;
  observations: number;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Converts the user's execution history into deterministic memory the agent can
 * use on its next planning pass. This is intentionally evidence-based: failed
 * or skipped actions are never treated as completed.
 */
export function learnExecutionProfile(events: ExecutionEvent[]): LearnedExecutionProfile {
  const successful = unique(events.filter((event) => event.status === "success").map((event) => event.actionId));
  const failed = unique(events.filter((event) => event.status === "failed").map((event) => event.actionId));
  const skipped = unique(events.filter((event) => event.status === "skipped").map((event) => event.actionId));
  const completedActionIds = successful;
  const observations = events.length;
  const successfulObservations = events.filter((event) => event.status === "success").length;

  return {
    completedActionIds,
    successfulActionIds: successful,
    failedActionIds: failed,
    skippedActionIds: skipped,
    successRate: observations === 0 ? 0 : successfulObservations / observations,
    observations,
  };
}

/**
 * Adds a new observation without mutating the caller's history.
 */
export function recordExecution(
  events: ExecutionEvent[],
  event: ExecutionEvent,
): ExecutionEvent[] {
  return [...events, { ...event }];
}

/**
 * Returns the most recent observation for an action. Useful before an agent
 * retries an action so it can distinguish a previous failure from completion.
 */
export function latestExecution(
  events: ExecutionEvent[],
  actionId: string,
): ExecutionEvent | undefined {
  return [...events]
    .reverse()
    .find((event) => event.actionId === actionId);
}
