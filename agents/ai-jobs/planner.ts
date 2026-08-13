import type { ScoredOpportunity } from "../drop-hunter/types.js";
import type { AIJobRequest } from "./types.js";

export interface AIJobPlanningOptions {
  agentId: string;
  reward: string;
  minimumScore?: number;
}

/**
 * Default threshold for the first-wave catalog.
 *
 * Drop Hunter intentionally uses conservative evidence-weighted scores. A
 * score of 30+ represents a sufficiently evidenced developer action for the
 * local planner; higher-risk production execution is still gated elsewhere.
 */
export const DEFAULT_MINIMUM_SCORE = 30;

function hashSeed(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function planOpportunityJob(
  opportunity: ScoredOpportunity,
  options: AIJobPlanningOptions,
): AIJobRequest | undefined {
  const minimumScore = options.minimumScore ?? DEFAULT_MINIMUM_SCORE;
  if (!Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 100) {
    throw new Error("minimumScore must be between 0 and 100");
  }
  if (opportunity.score < minimumScore) return undefined;

  const actionList = opportunity.actions.length > 0
    ? opportunity.actions.map((action, index) => `${index + 1}. ${action}`).join("\n")
    : "No executable actions are currently recorded.";

  const prompt = [
    `Target: ${opportunity.name}`,
    `Stage: ${opportunity.stage}`,
    `Score: ${opportunity.score}`,
    `Priority: ${opportunity.priority}`,
    "",
    "Execute only the documented low-risk developer actions below.",
    actionList,
    "",
    "Do not invent reward evidence, contracts, deadlines, or eligibility requirements.",
  ].join("\n");

  const taskHash = hashSeed(`${opportunity.id}:${opportunity.score}:${actionList}`);

  return {
    idempotencyKey: `opportunity:${opportunity.id}:${opportunity.score}`,
    agentId: options.agentId,
    taskHash,
    prompt,
    reward: options.reward,
    trigger: "opportunity",
    opportunityId: opportunity.id,
    metadata: {
      opportunityName: opportunity.name,
      chainId: opportunity.chainId?.toString() ?? "",
      score: opportunity.score.toString(),
      priority: opportunity.priority.toString(),
    },
  };
}

export function planTopOpportunityJobs(
  opportunities: ScoredOpportunity[],
  options: AIJobPlanningOptions,
): AIJobRequest[] {
  return opportunities
    .map((opportunity) => planOpportunityJob(opportunity, options))
    .filter((job): job is AIJobRequest => job !== undefined);
}
