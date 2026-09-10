import type { DropIntelligenceResult } from "../drop-hunter/drop-intelligence.js";
import type { DropTask } from "../drop-hunter/task-model.js";
import type { AIJobRequest } from "./types.js";

export interface DropTaskJobPlanningOptions {
  agentId: string;
  reward: string;
  minimumScore?: number;
  includeApprovalRequired?: boolean;
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
  const lines = [
    `Opportunity: ${result.opportunity.name}`,
    `Opportunity ID: ${result.opportunity.id}`,
    `Opportunity score: ${result.score.total}`,
    `Task: ${task.title}`,
    `Task ID: ${task.id}`,
    `Kind: ${task.kind}`,
    `Risk: ${task.risk}`,
    `Automated: ${task.automated ? "yes" : "no"}`,
    `Wallet required: ${task.requiresWallet ? "yes" : "no"}`,
    `Gas required: ${task.requiresGas ? "yes" : "no"}`,
    `User approval required: ${task.requiresUserApproval ? "yes" : "no"}`,
    `Description: ${task.description}`,
    `Prerequisites: ${task.prerequisites.length ? task.prerequisites.join("; ") : "none"}`,
    `Evidence required: ${task.evidenceRequired.length ? task.evidenceRequired.join("; ") : "none"}`,
    `Source: ${task.source}`,
    "",
    "Prepare or execute only this documented project task.",
    "Do not invent reward evidence, deadlines, contracts, eligibility requirements, or completion state.",
    "Do not sign transactions or spend funds without the explicit wallet approval boundary.",
  ];
  return lines.join("\n");
}

export function planDropTaskJob(
  result: DropIntelligenceResult,
  task: DropTask,
  options: DropTaskJobPlanningOptions,
): AIJobRequest | undefined {
  const minimumScore = options.minimumScore ?? DEFAULT_MINIMUM_SCORE;
  if (!Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 100) {
    throw new Error("minimumScore must be between 0 and 100");
  }
  if (result.score.total < minimumScore) return undefined;
  if (!options.includeApprovalRequired && task.requiresUserApproval) return undefined;

  const taskHash = hashSeed([
    result.opportunity.id,
    result.score.total,
    task.id,
    task.title,
    task.description,
    task.source,
  ].join(":"));

  return {
    idempotencyKey: `drop-task:${task.id}:${result.score.total}`,
    agentId: options.agentId,
    taskHash,
    prompt: taskPrompt(result, task),
    reward: options.reward,
    trigger: "opportunity",
    opportunityId: result.opportunity.id,
    chainTargetId: result.opportunity.chainId?.toString(),
    metadata: {
      opportunityName: result.opportunity.name,
      opportunityScore: result.score.total.toString(),
      taskId: task.id,
      taskKind: task.kind,
      taskRisk: task.risk,
      automated: task.automated.toString(),
      requiresWallet: task.requiresWallet.toString(),
      requiresGas: task.requiresGas.toString(),
      requiresUserApproval: task.requiresUserApproval.toString(),
      source: task.source,
    },
  };
}

export function planDropTaskJobs(
  results: DropIntelligenceResult[],
  options: DropTaskJobPlanningOptions,
): AIJobRequest[] {
  const jobs: AIJobRequest[] = [];
  for (const result of results) {
    for (const task of result.tasks) {
      const job = planDropTaskJob(result, task, options);
      if (job) jobs.push(job);
    }
  }
  return jobs;
}
