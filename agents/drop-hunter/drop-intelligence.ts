import type { ProjectOpportunity, ScoredOpportunity } from "./types.js";
import { scoreOpportunity } from "./scorer.js";
import { extractDropTasks } from "./task-extractor.js";
import type { DropOpportunityScore, DropTask } from "./task-model.js";

export interface DropIntelligenceResult {
  opportunity: ScoredOpportunity;
  tasks: DropTask[];
  score: DropOpportunityScore;
  warnings: string[];
  executableTaskCount: number;
}

/**
 * Turns a raw opportunity into the unit consumed by the future agent planner:
 * scored opportunity + normalized project tasks + reward/execution signals.
 *
 * This layer deliberately does not claim that a reward exists. Reward signals
 * are evidence, not proof of eligibility.
 */
export function analyzeDropOpportunity(
  opportunity: ProjectOpportunity,
  options: { observedAt?: string; deadline?: string } = {},
): DropIntelligenceResult {
  const scored = scoreOpportunity(opportunity);
  const extracted = extractDropTasks(opportunity, {
    source: opportunity.sources[0],
    defaultDeadline: options.deadline,
  });

  const tasks = extracted.tasks;
  const executable = tasks.filter((task) => task.automated && !task.requiresUserApproval).length;
  const risky = tasks.filter((task) => task.risk === "high").length;
  const walletTasks = tasks.filter((task) => task.requiresWallet).length;

  const rewardPotential = clamp(opportunity.signals.rewardSignals ?? 0);
  const effort = tasks.length === 0
    ? 0
    : clamp(100 - tasks.length * 12 - walletTasks * 5);
  const risk = clamp(risky * 30 + tasks.filter((task) => task.risk === "medium").length * 10);
  const freshness = options.observedAt ? freshnessScore(options.observedAt) : 50;

  const total = Math.round(clamp(
    scored.score * 0.45 +
    rewardPotential * 0.20 +
    effort * 0.15 +
    (100 - risk) * 0.10 +
    freshness * 0.10,
  ));

  const reasons = [...scored.reasons];
  if (rewardPotential > 0) reasons.push(`Reward signal: ${rewardPotential}/100`);
  if (executable > 0) reasons.push(`${executable} low-risk task(s) can be prepared for automation`);
  if (walletTasks > 0) reasons.push(`${walletTasks} task(s) require wallet activity`);
  if (risky > 0) reasons.push(`${risky} high-risk task(s) require explicit approval`);
  if (extracted.warnings.length > 0) reasons.push(`${extracted.warnings.length} task extraction warning(s)`);

  return {
    opportunity: scored,
    tasks,
    score: {
      total,
      confidence: scored.confidence,
      rewardPotential,
      effort,
      risk,
      freshness,
      reasons,
    },
    warnings: extracted.warnings,
    executableTaskCount: executable,
  };
}

export function rankDropOpportunities(results: DropIntelligenceResult[]): DropIntelligenceResult[] {
  return [...results].sort((a, b) => {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    if (b.score.confidence !== a.score.confidence) return b.score.confidence - a.score.confidence;
    return b.opportunity.priority - a.opportunity.priority;
  });
}

function freshnessScore(observedAt: string): number {
  const timestamp = Date.parse(observedAt);
  if (!Number.isFinite(timestamp)) return 0;
  const ageHours = Math.max(0, (Date.now() - timestamp) / 3_600_000);
  return clamp(100 - ageHours * 4);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
