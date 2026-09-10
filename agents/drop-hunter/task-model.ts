export type DropTaskKind =
  | "social"
  | "community"
  | "check-in"
  | "faucet"
  | "bridge"
  | "swap"
  | "liquidity"
  | "stake"
  | "deploy"
  | "mint"
  | "contract-call"
  | "quest"
  | "verify"
  | "other";

export type DropTaskRisk = "low" | "medium" | "high";
export type DropTaskRecurrence = "once" | "daily" | "weekly" | "monthly";

export interface DropTask {
  id: string;
  opportunityId: string;
  title: string;
  description: string;
  kind: DropTaskKind;
  risk: DropTaskRisk;
  automated: boolean;
  requiresWallet: boolean;
  requiresGas: boolean;
  requiresUserApproval: boolean;
  estimatedCostUsd?: number;
  rewardHint?: string;
  deadline?: string;
  recurrence?: DropTaskRecurrence;
  recurrenceInterval?: number;
  prerequisites: string[];
  evidenceRequired: string[];
  source: string;
}

export interface TaskExtractionResult {
  tasks: DropTask[];
  warnings: string[];
}

export interface DropOpportunityScore {
  total: number;
  confidence: number;
  rewardPotential: number;
  effort: number;
  risk: number;
  freshness: number;
  reasons: string[];
}
