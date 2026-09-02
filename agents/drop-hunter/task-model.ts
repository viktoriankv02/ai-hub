export type DropTaskKind =
  | "social"
  | "community"
  | "bridge"
  | "swap"
  | "liquidity"
  | "stake"
  | "deploy"
  | "mint"
  | "quest"
  | "verify"
  | "other";

export type DropTaskRisk = "low" | "medium" | "high";

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
