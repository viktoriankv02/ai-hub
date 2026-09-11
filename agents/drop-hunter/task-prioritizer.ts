import type { DropTaskAutomationDecision } from "./automation-policy.js";
import type { DropHunterLearningSignals } from "./learning-signals.js";
import { learningAdjustment } from "./learning-signals.js";
import type { DropTask } from "./task-model.js";

export interface DropHunterTaskPriorityInput {
  projectId: string;
  projectScore: number;
  rewardPotential?: number;
  task: DropTask;
  automation: DropTaskAutomationDecision;
  learning?: DropHunterLearningSignals;
  now?: string;
}

export interface DropHunterTaskPriority {
  score: number;
  reasons: string[];
}

export function prioritizeDropHunterTask(input: DropHunterTaskPriorityInput): DropHunterTaskPriority {
  const reasons: string[] = [];
  let score = clamp(input.projectScore, 0, 100) * 0.35;
  score += clamp(input.rewardPotential ?? 0, 0, 100) * 0.25;

  if (input.automation.mode === "autonomous") {
    score += 15;
    reasons.push("safe autonomous task");
  } else if (input.automation.mode === "approval") {
    score += 5;
    reasons.push("requires user approval");
  } else if (input.automation.mode === "manual") {
    score -= 5;
    reasons.push("manual participation required");
  } else {
    score -= 20;
    reasons.push("automation disabled");
  }

  const riskPenalty = input.task.risk === "high" ? 20 : input.task.risk === "medium" ? 8 : 0;
  score -= riskPenalty;
  if (riskPenalty) reasons.push(`${input.task.risk}-risk penalty`);

  const cost = Math.max(0, input.task.estimatedCostUsd ?? 0);
  const costPenalty = Math.min(20, Math.log10(cost + 1) * 8);
  score -= costPenalty;
  if (cost > 0) reasons.push(`estimated cost $${cost.toFixed(2)}`);

  if (input.task.requiresWallet) score -= 3;
  if (input.task.requiresGas) score -= 3;

  const deadlineBoost = deadlinePriority(input.task.deadline, input.now ?? new Date().toISOString());
  score += deadlineBoost.value;
  if (deadlineBoost.reason) reasons.push(deadlineBoost.reason);

  if (input.task.recurrence && input.task.recurrence !== "once") {
    score += 4;
    reasons.push(`${input.task.recurrence} recurring task`);
  }

  if (input.learning) {
    const adjustment = learningAdjustment({
      projectId: input.projectId,
      taskKind: input.task.kind,
      source: input.task.source,
      signals: input.learning,
    });
    score += adjustment;
    if (adjustment !== 0) reasons.push(`learning adjustment ${adjustment > 0 ? "+" : ""}${adjustment}`);
  }

  return { score: Math.round(clamp(score, 0, 100) * 100) / 100, reasons };
}

export function compareDropHunterTaskPriority(
  a: { priority: DropHunterTaskPriority; task: Pick<DropTask, "id"> },
  b: { priority: DropHunterTaskPriority; task: Pick<DropTask, "id"> },
): number {
  return b.priority.score - a.priority.score || a.task.id.localeCompare(b.task.id);
}

function deadlinePriority(deadline: string | undefined, now: string): { value: number; reason?: string } {
  if (!deadline) return { value: 0 };
  const due = Date.parse(deadline);
  const current = Date.parse(now);
  if (!Number.isFinite(due) || !Number.isFinite(current)) return { value: 0 };
  const days = (due - current) / 86_400_000;
  if (days < 0) return { value: -30, reason: "deadline already passed" };
  if (days <= 1) return { value: 18, reason: "deadline within 24 hours" };
  if (days <= 3) return { value: 12, reason: "deadline within 3 days" };
  if (days <= 7) return { value: 7, reason: "deadline within 7 days" };
  if (days <= 30) return { value: 3, reason: "deadline within 30 days" };
  return { value: 0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
