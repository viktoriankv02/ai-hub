import type { DropTaskAutomationPolicy } from "./automation-policy.js";
import type { DropHunterProductStore, StoredDropTask } from "./product-store.js";

export interface DropHunterApprovalRequest {
  id: string;
  projectId: string;
  projectName: string;
  projectScore: number;
  chainId?: number;
  taskId: string;
  taskTitle: string;
  taskKind: StoredDropTask["kind"];
  taskStatus: StoredDropTask["status"];
  risk: StoredDropTask["risk"];
  estimatedCostUsd?: number;
  rewardHint?: string;
  requiresWalletSignature: boolean;
  requiresFunds: boolean;
  reasons: string[];
  source: string;
  deadline?: string;
  updatedAt: string;
}

export class DropHunterApprovalInbox {
  constructor(
    private readonly projects: DropHunterProductStore,
    private readonly policy: DropTaskAutomationPolicy,
  ) {}

  async list(): Promise<DropHunterApprovalRequest[]> {
    const requests: DropHunterApprovalRequest[] = [];
    for (const project of await this.projects.listProjects()) {
      if (["paused", "completed", "archived"].includes(project.status)) continue;
      for (const task of project.tasks) {
        if (["ready", "running", "completed", "skipped"].includes(task.status)) continue;
        const decision = this.policy.decide(task);
        if (decision.mode !== "approval") continue;
        requests.push({
          id: `${project.id}:${task.id}`,
          projectId: project.id,
          projectName: project.opportunity.name,
          projectScore: project.intelligence?.total ?? project.opportunity.score,
          chainId: project.opportunity.chainId,
          taskId: task.id,
          taskTitle: task.title,
          taskKind: task.kind,
          taskStatus: task.status,
          risk: task.risk,
          estimatedCostUsd: task.estimatedCostUsd,
          rewardHint: task.rewardHint,
          requiresWalletSignature: task.requiresWallet,
          requiresFunds: task.requiresGas || (task.estimatedCostUsd ?? 0) > 0,
          reasons: [...decision.reasons],
          source: task.source,
          deadline: task.deadline,
          updatedAt: task.updatedAt,
        });
      }
    }
    return requests.sort(compareApprovalRequests);
  }
}

function compareApprovalRequests(a: DropHunterApprovalRequest, b: DropHunterApprovalRequest): number {
  const risk = { high: 3, medium: 2, low: 1 } as const;
  return risk[b.risk] - risk[a.risk]
    || b.projectScore - a.projectScore
    || deadlineRank(a.deadline) - deadlineRank(b.deadline)
    || b.updatedAt.localeCompare(a.updatedAt)
    || a.id.localeCompare(b.id);
}

function deadlineRank(value?: string): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}
