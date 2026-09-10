import type { ExecutionRisk } from "./action-planner.js";

export type ExecutionMode = "dry-run" | "execute";

export interface ExecutionGateRequest {
  actionId: string;
  risk: ExecutionRisk;
  automated: boolean;
  requiresWallet: boolean;
  requiresGas: boolean;
  mode: ExecutionMode;
  approved?: boolean;
  walletConnected?: boolean;
  gasAvailable?: boolean;
}

export interface ExecutionGateDecision {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason: string;
}

function riskRank(risk: ExecutionRisk): number {
  return risk === "low" ? 0 : risk === "medium" ? 1 : 2;
}

export interface ExecutionGatePolicy {
  maxRisk: ExecutionRisk;
  requireApprovalForRiskAtOrAbove: ExecutionRisk;
  requireApprovalForAutomatedExecution: boolean;
}

const DEFAULT_POLICY: ExecutionGatePolicy = {
  maxRisk: "medium",
  requireApprovalForRiskAtOrAbove: "medium",
  requireApprovalForAutomatedExecution: true,
};

export class ExecutionGate {
  private readonly policy: ExecutionGatePolicy;

  constructor(policy: Partial<ExecutionGatePolicy> = {}) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  evaluate(request: ExecutionGateRequest): ExecutionGateDecision {
    if (request.mode === "dry-run") return { allowed: true, requiresConfirmation: false, reason: "dry-run does not perform external side effects" };
    if (riskRank(request.risk) > riskRank(this.policy.maxRisk)) return { allowed: false, requiresConfirmation: true, reason: `risk ${request.risk} exceeds policy limit ${this.policy.maxRisk}` };
    if (request.requiresWallet && !request.walletConnected) return { allowed: false, requiresConfirmation: false, reason: "wallet connection is required" };
    if (request.requiresGas && !request.gasAvailable) return { allowed: false, requiresConfirmation: false, reason: "gas availability is required" };
    const approvalRequired = request.risk === "high" || riskRank(request.risk) >= riskRank(this.policy.requireApprovalForRiskAtOrAbove) || (request.automated && this.policy.requireApprovalForAutomatedExecution);
    if (approvalRequired && !request.approved) return { allowed: false, requiresConfirmation: true, reason: "explicit user approval is required" };
    return { allowed: true, requiresConfirmation: false, reason: "execution satisfies the configured policy" };
  }

  /**
   * Re-evaluate a previously approved action against the current wallet/gas
   * state. Approval is intentionally supplied again so a stale decision can
   * never authorize execution after the execution context changes.
   */
  revalidate(
    request: Omit<ExecutionGateRequest, "approved"> & { approved?: boolean },
  ): ExecutionGateDecision {
    return this.evaluate(request);
  }
}
