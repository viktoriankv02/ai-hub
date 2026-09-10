import type { DropTask } from "./task-model.js";
import type { ProjectOpportunity } from "./types.js";

export interface RewardAnalysisInput {
  opportunity: ProjectOpportunity;
  tasks: DropTask[];
  walletGasBudgetUsd?: number;
  minimumExpectedRoi?: number;
}

export interface RewardAnalysis {
  rewardSignal: number;
  estimatedCostUsd: number;
  estimatedEffortMinutes: number;
  expectedValueScore: number;
  roiScore: number;
  eligibleToExecute: boolean;
  blockers: string[];
  assumptions: string[];
}

/**
 * Conservative economics layer. A reward signal is never treated as a
 * guaranteed payout; unknown monetary values remain unknown.
 */
export function analyzeRewardEconomics(input: RewardAnalysisInput): RewardAnalysis {
  const { opportunity, tasks } = input;
  const assumptions: string[] = [];
  const blockers: string[] = [];
  const rewardSignal = clamp(opportunity.signals.rewardSignals ?? 0);
  const estimatedCostUsd = tasks.reduce((sum, task) => sum + (task.estimatedCostUsd ?? defaultCost(task.kind)), 0);
  const estimatedEffortMinutes = tasks.reduce((sum, task) => sum + defaultEffort(task.kind), 0);

  if (rewardSignal === 0) assumptions.push("No verified monetary reward value was supplied by the discovery source.");
  else assumptions.push("Reward score is a discovery signal, not proof of allocation or eligibility.");
  if (estimatedCostUsd > 0) assumptions.push(`Estimated task cost is ${estimatedCostUsd.toFixed(2)} USD and must be rechecked before execution.`);

  const walletBudget = input.walletGasBudgetUsd;
  if (walletBudget !== undefined && estimatedCostUsd > walletBudget) {
    blockers.push(`Estimated cost exceeds configured wallet budget (${walletBudget.toFixed(2)} USD).`);
  }
  if (tasks.some((task) => task.risk === "high")) blockers.push("High-risk tasks require explicit approval.");
  if (tasks.length === 0) blockers.push("No actionable tasks were extracted.");

  const effortScore = clamp(100 - estimatedEffortMinutes * 0.8);
  const costScore = estimatedCostUsd === 0 ? 100 : clamp(100 - estimatedCostUsd * 8);
  const expectedValueScore = Math.round(clamp(rewardSignal * 0.55 + effortScore * 0.2 + costScore * 0.25));
  const roiScore = Math.round(clamp(expectedValueScore - Math.min(50, estimatedCostUsd * 5)));

  const minimum = input.minimumExpectedRoi ?? 0;
  if (roiScore < minimum) blockers.push(`Expected ROI score ${roiScore} is below configured minimum ${minimum}.`);

  return {
    rewardSignal,
    estimatedCostUsd,
    estimatedEffortMinutes,
    expectedValueScore,
    roiScore,
    eligibleToExecute: blockers.length === 0,
    blockers,
    assumptions,
  };
}

function defaultCost(kind: DropTask["kind"]): number {
  switch (kind) {
    case "bridge": return 1.5;
    case "swap": return 1;
    case "liquidity": return 5;
    case "stake": return 2;
    case "deploy": return 3;
    case "mint": return 1.5;
    default: return 0;
  }
}

function defaultEffort(kind: DropTask["kind"]): number {
  switch (kind) {
    case "social": return 2;
    case "community": return 3;
    case "quest": return 8;
    case "verify": return 2;
    case "bridge": return 5;
    case "swap": return 5;
    case "liquidity": return 10;
    case "stake": return 7;
    case "deploy": return 20;
    case "mint": return 5;
    default: return 10;
  }
}

function clamp(value: number): number { return Math.max(0, Math.min(100, value)); }
