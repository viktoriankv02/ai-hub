import type { DropIntelligenceResult } from "../drop-hunter/drop-intelligence.js";
import type { DropTask } from "../drop-hunter/task-model.js";
import type { AIJobRequest } from "./types.js";

export interface DropTaskJobPlanningOptions {
  agentId: string;
  reward: string;
  minimumScore?: number;
}

const DEFAULT_MINIMUM_SCORE = 30;

function hashSeed(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function taskPrompt(result: DropIntelligenceResult, task: DropTask): string {
  return [
    `Opportunity: ${result.opportunity.name}`,
    `Opportunity score: ${result.score.total}/100`,
    `Confidence: ${result.score.confidence}/100`,
    `Task: ${task.title}`,
    `Kind: ${task.kind}`,
    `Risk: ${task.risk}`,
    `Automated: ${task.automated ? "yes" : "no"}`,
    `Wallet required: ${task.requiresWallet ? "yes" : "no"}`,
    `Gas required: ${task.requiresGas ? "yes" : "no"}`,
    `User approval required: ${task.requiresUserApproval ? "yes" : "no"}`,
    task.estimatedCostUsd === undefined ? "Estimated cost: unknown" : `Estimated cost: $${task.estimatedCostUsd.toFixed(2)}`,
    `Description: ${task.description}`,
    `Prerequisites: ${task.prerequisites.join("; ") || "none documented"}`,
    `Evidence required: ${task.evidenceRequired.join("; ") || "source-defined completion evidence"}`,
    `Source: ${task.source}`,
    "",
    "Prepare or execute only the documented task.",
    "Do not invent reward eligibility, deadlines, contracts, URLs, or completion evidence.",
    task.requiresUserApproval
      ? "This task requires explicit user approval before any wallet-signing or spending action."
      : "Do not sign or spend funds unless the execution adapter explicitly permits it.",
  ].join("\n");
}

export function planDropTaskJobs(
  results: DropIntelligenceResult[],
  options: DropTaskJobPlanningOptions,
): AIJobRequest[] {
  const minimumScore = options.minimumScore ?? DEFAULT_MINIMUM_SCORE;
  if (!Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 100) {
    throw new Error("minimumScore must be between 0 and 100");
  }

  const requests: AIJobRequest[] = [];
  for (const result of results) {
    if (result.score.total < minimumScore) continue;
    for (const task of result.tasks) {
      const prompt = taskPrompt(result, task);
      const taskHash = hashSeed(`${result.opportunity.id}:${task.id}:${prompt}`);
      requests.push({
        idempotencyKey: `drop-task:${task.id}:${result.score.total}`,
        agentId: options.agentId,
        taskHash,
        prompt,
        reward: options.reward,
        trigger: "opportunity",
        opportunityId: result.opportunity.id,
        chainTargetId: result.opportunity.chainId?.toString(),
        metadata: {
          opportunityName: result.opportunity.name,
          taskId: task.id,
          taskKind: task.kind,
          taskRisk: task.risk,
          automated: String(task.automated),
          requiresWallet: String(task.requiresWallet),
          requiresGas: String(task.requiresGas),
          requiresUserApproval: String(task.requiresUserApproval),
          score: result.score.total.toString(),
          confidence: result.score.confidence.toString(),
          source: task.source,
        },
      });
    }
  }
  return requests;
}
