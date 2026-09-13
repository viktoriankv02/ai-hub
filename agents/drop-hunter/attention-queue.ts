import type { DropTaskAutomationDecision } from "./automation-policy.js";
import { DropTaskAutomationPolicy } from "./automation-policy.js";
import type { DropHunterProjectRecord, StoredDropTask } from "./product-store.js";

export type DropHunterAttentionReason = "approval" | "manual" | "failed" | "wallet" | "gas" | "high-risk";
export type DropHunterAttentionSeverity = "info" | "warning" | "critical";

export interface DropHunterAttentionItem {
  id: string;
  projectId: string;
  projectName: string;
  projectScore: number;
  taskId: string;
  taskTitle: string;
  taskKind: StoredDropTask["kind"];
  taskStatus: StoredDropTask["status"];
  reason: DropHunterAttentionReason;
  severity: DropHunterAttentionSeverity;
  summary: string;
  automation: DropTaskAutomationDecision;
  updatedAt: string;
  lastError?: string;
}

export class DropHunterAttentionQueue {
  constructor(private readonly policy: DropTaskAutomationPolicy = new DropTaskAutomationPolicy()) {}

  build(projects: readonly DropHunterProjectRecord[]): DropHunterAttentionItem[] {
    const items: DropHunterAttentionItem[] = [];
    for (const project of projects) {
      if (project.status === "archived" || project.status === "completed") continue;
      for (const task of project.tasks) {
        if (task.status === "completed" || task.status === "skipped") continue;
        const automation = this.policy.decide(task);
        const reason = attentionReason(task, automation);
        if (!reason) continue;
        items.push({
          id: `${project.id}:${task.id}:${reason}`,
          projectId: project.id,
          projectName: project.opportunity.name,
          projectScore: project.intelligence?.total ?? project.opportunity.score,
          taskId: task.id,
          taskTitle: task.title,
          taskKind: task.kind,
          taskStatus: task.status,
          reason,
          severity: severityFor(task, reason),
          summary: summaryFor(task, automation, reason),
          automation,
          updatedAt: task.updatedAt,
          lastError: task.lastError,
        });
      }
    }

    return items.sort((a, b) => {
      const severityDelta = severityRank(b.severity) - severityRank(a.severity);
      return severityDelta || b.projectScore - a.projectScore || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
    });
  }
}

function attentionReason(task: StoredDropTask, automation: DropTaskAutomationDecision): DropHunterAttentionReason | undefined {
  if (task.status === "failed") return "failed";
  if (task.risk === "high") return "high-risk";
  if (task.requiresWallet) return "wallet";
  if (task.requiresGas) return "gas";
  if (automation.mode === "manual") return "manual";
  if (automation.mode === "approval" && task.status !== "ready") return "approval";
  return undefined;
}

function severityFor(task: StoredDropTask, reason: DropHunterAttentionReason): DropHunterAttentionSeverity {
  if (reason === "failed" || reason === "high-risk") return "critical";
  if (task.risk === "medium" || reason === "wallet" || reason === "gas" || reason === "approval") return "warning";
  return "info";
}

function summaryFor(task: StoredDropTask, automation: DropTaskAutomationDecision, reason: DropHunterAttentionReason): string {
  if (reason === "failed") return task.lastError ? `Task failed: ${task.lastError}` : "Task failed and needs review before retry.";
  if (reason === "wallet") return "Wallet action requires explicit user approval before execution.";
  if (reason === "gas") return "Gas-spending action requires explicit user approval before execution.";
  if (reason === "high-risk") return "High-risk task requires explicit user review.";
  if (reason === "manual") return automation.reasons[0] ?? "Task requires manual participation.";
  return automation.reasons[0] ?? "Task requires approval before execution.";
}

function severityRank(value: DropHunterAttentionSeverity): number {
  if (value === "critical") return 3;
  if (value === "warning") return 2;
  return 1;
}
