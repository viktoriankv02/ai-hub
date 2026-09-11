import type { DropTaskAutomationDecision } from "./automation-policy.js";
import { DropTaskAutomationPolicy } from "./automation-policy.js";
import type { DropHunterIngestionResult } from "./product-ingestion.js";
import { DropHunterProductIngestionService } from "./product-ingestion.js";
import type {
  DropHunterProductStore,
  DropHunterProjectRecord,
  DropHunterProjectStatus,
  DropHunterTaskStatus,
  StoredDropTask,
  TaskStatusDetails,
} from "./product-store.js";
import { DropHunterProjectRepository } from "./product-store.js";
import { isRecurringTaskDue } from "./task-schedule.js";
import type { DropHunterEvidenceStore } from "./evidence-history.js";
import { createEvidenceRecord } from "./evidence-history.js";

export interface DropHunterDashboardSummary {
  projects: number;
  activeProjects: number;
  highScoreProjects: number;
  tasks: number;
  readyTasks: number;
  autonomousTasks: number;
  approvalTasks: number;
  completedTasks: number;
  failedTasks: number;
}

export interface DropHunterTaskView {
  projectId: string;
  projectName: string;
  projectScore: number;
  task: StoredDropTask;
  automation: DropTaskAutomationDecision;
}

export class DropHunterProductControlPlane {
  constructor(
    private readonly store: DropHunterProductStore,
    private readonly repository: DropHunterProjectRepository,
    private readonly ingestion?: DropHunterProductIngestionService,
    private readonly policy: DropTaskAutomationPolicy = new DropTaskAutomationPolicy(),
    private readonly now: () => Date = () => new Date(),
    private readonly evidence?: DropHunterEvidenceStore,
  ) {}

  async scan(): Promise<DropHunterIngestionResult> {
    if (!this.ingestion) throw new Error("Drop Hunter discovery ingestion is not configured");
    return this.ingestion.ingest();
  }

  async listProjects(): Promise<DropHunterProjectRecord[]> {
    const projects = await this.store.listProjects();
    return projects.sort((a, b) => {
      const scoreDelta = (b.intelligence?.total ?? b.opportunity.score) - (a.intelligence?.total ?? a.opportunity.score);
      return scoreDelta || b.lastSeenAt.localeCompare(a.lastSeenAt) || a.id.localeCompare(b.id);
    });
  }

  async getProject(id: string): Promise<DropHunterProjectRecord | undefined> {
    return this.store.getProject(id);
  }

  async dashboard(highScoreThreshold = 85): Promise<DropHunterDashboardSummary> {
    const projects = await this.store.listProjects();
    const tasks = projects.flatMap((project) => project.tasks.map((task) => ({ project, task })));
    const decisions = tasks.map(({ task }) => ({ task, decision: this.policy.decide(task) }));
    const due = (task: StoredDropTask) => task.status === "completed" && isRecurringTaskDue(task, this.now().toISOString());

    return {
      projects: projects.length,
      activeProjects: projects.filter((project) => project.status === "active" || project.status === "new").length,
      highScoreProjects: projects.filter((project) => (project.intelligence?.total ?? project.opportunity.score) >= highScoreThreshold).length,
      tasks: tasks.length,
      readyTasks: tasks.filter(({ task }) => task.status === "ready" || task.status === "pending" || due(task)).length,
      autonomousTasks: decisions.filter(({ task, decision }) => decision.mode === "autonomous" && task.status !== "skipped" && (task.status !== "completed" || due(task))).length,
      approvalTasks: decisions.filter(({ task, decision }) => decision.mode === "approval" && task.status !== "ready" && task.status !== "completed" && task.status !== "skipped").length,
      completedTasks: tasks.filter(({ task }) => task.status === "completed" && !due(task)).length,
      failedTasks: tasks.filter(({ task }) => task.status === "failed").length,
    };
  }

  async taskQueue(mode?: DropTaskAutomationDecision["mode"]): Promise<DropHunterTaskView[]> {
    const projects = await this.listProjects();
    const queue: DropHunterTaskView[] = [];
    const now = this.now().toISOString();
    for (const project of projects) {
      if (project.status === "paused" || project.status === "archived" || project.status === "completed") continue;
      for (const task of project.tasks) {
        const recurringDue = task.status === "completed" && isRecurringTaskDue(task, now);
        if (task.status === "skipped" || (task.status === "completed" && !recurringDue)) continue;
        const automation = this.policy.decide(task);
        if (mode && automation.mode !== mode) continue;
        if (mode === "approval" && task.status === "ready") continue;
        queue.push({
          projectId: project.id,
          projectName: project.opportunity.name,
          projectScore: project.intelligence?.total ?? project.opportunity.score,
          task,
          automation,
        });
      }
    }
    return queue;
  }

  async approvedTaskQueue(): Promise<DropHunterTaskView[]> {
    const projects = await this.listProjects();
    const queue: DropHunterTaskView[] = [];
    for (const project of projects) {
      if (project.status === "paused" || project.status === "archived" || project.status === "completed") continue;
      for (const task of project.tasks) {
        if (task.status !== "ready") continue;
        const automation = this.policy.decide(task);
        if (automation.mode !== "approval") continue;
        queue.push({
          projectId: project.id,
          projectName: project.opportunity.name,
          projectScore: project.intelligence?.total ?? project.opportunity.score,
          task,
          automation,
        });
      }
    }
    return queue;
  }

  async setProjectStatus(id: string, status: DropHunterProjectStatus): Promise<DropHunterProjectRecord> {
    return this.repository.setProjectStatus(id, status);
  }

  async setTaskStatus(projectId: string, taskId: string, status: DropHunterTaskStatus, details: TaskStatusDetails = {}): Promise<StoredDropTask> {
    const task = await this.repository.setTaskStatus(projectId, taskId, status, details);
    await this.recordTerminalOutcome(projectId, task, status, details);
    return task;
  }

  async approveTask(projectId: string, taskId: string): Promise<StoredDropTask> {
    const project = await this.store.getProject(projectId);
    if (!project) throw new Error(`drop hunter project not found: ${projectId}`);
    const task = project.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error(`drop hunter task not found: ${taskId}`);
    const decision = this.policy.decide(task);
    if (decision.mode === "manual") throw new Error(`manual task cannot be approved for agent execution: ${taskId}`);
    if (decision.mode === "disabled") throw new Error(`automation is disabled for task: ${taskId}`);
    return this.repository.setTaskStatus(projectId, taskId, "ready");
  }

  async skipTask(projectId: string, taskId: string): Promise<StoredDropTask> {
    return this.setTaskStatus(projectId, taskId, "skipped");
  }

  private async recordTerminalOutcome(projectId: string, task: StoredDropTask, status: DropHunterTaskStatus, details: TaskStatusDetails): Promise<void> {
    if (!this.evidence || !["completed", "failed", "skipped"].includes(status)) return;
    const project = await this.store.getProject(projectId);
    const outcome = status === "completed" ? "success" : status === "failed" ? "failed" : "skipped";
    await this.evidence.append(createEvidenceRecord({
      projectId,
      taskId: task.id,
      taskKind: task.kind,
      outcome,
      rewardOutcome: "unknown",
      source: task.source,
      chainId: project?.opportunity.chainId,
      transactionHash: details.txHash,
      contractAddress: details.contractAddress,
      blockNumber: details.blockNumber,
      note: details.error,
      timestamp: this.now().toISOString(),
    }));
  }
}
