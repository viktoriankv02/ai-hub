import type { DropTaskAutomationDecision } from "./automation-policy.js";
import type { DropHunterProductControlPlane, DropHunterTaskView } from "./product-control-plane.js";
import type { DropTaskKind } from "./task-model.js";

export interface DropHunterAgentTaskExecutionContext {
  projectId: string;
  projectName: string;
  projectScore: number;
  taskId: string;
  taskKind: DropTaskKind;
  title: string;
  source: string;
}

export interface DropHunterAgentTaskExecutionResult {
  status: "completed" | "failed" | "skipped";
  note?: string;
  txHash?: string;
}

export interface DropHunterAgentTaskExecutor {
  readonly kinds: readonly DropTaskKind[];
  supports?(context: DropHunterAgentTaskExecutionContext): boolean;
  execute(context: DropHunterAgentTaskExecutionContext): Promise<DropHunterAgentTaskExecutionResult>;
}

export interface DropHunterAgentRunRecord {
  projectId: string;
  taskId: string;
  kind: DropTaskKind;
  automation: DropTaskAutomationDecision["mode"];
  result: DropHunterAgentTaskExecutionResult;
}

export interface DropHunterAgentRunResult {
  considered: number;
  executed: number;
  completed: number;
  failed: number;
  skipped: number;
  records: DropHunterAgentRunRecord[];
}

export interface DropHunterAgentTaskRunnerOptions {
  maxTasksPerRun?: number;
}

export class DropHunterAgentTaskRunner {
  private readonly executors = new Map<DropTaskKind, DropHunterAgentTaskExecutor>();
  private readonly maxTasksPerRun: number;

  constructor(
    private readonly control: DropHunterProductControlPlane,
    executors: readonly DropHunterAgentTaskExecutor[] = [],
    options: DropHunterAgentTaskRunnerOptions = {},
  ) {
    this.maxTasksPerRun = options.maxTasksPerRun ?? 10;
    if (!Number.isInteger(this.maxTasksPerRun) || this.maxTasksPerRun < 1 || this.maxTasksPerRun > 100) {
      throw new Error("maxTasksPerRun must be an integer between 1 and 100");
    }
    for (const executor of executors) this.register(executor);
  }

  register(executor: DropHunterAgentTaskExecutor): void {
    if (executor.kinds.length === 0) throw new Error("agent task executor must support at least one task kind");
    for (const kind of executor.kinds) {
      if (this.executors.has(kind)) throw new Error(`agent task executor already registered for kind: ${kind}`);
      this.executors.set(kind, executor);
    }
  }

  async runOnce(): Promise<DropHunterAgentRunResult> {
    const autonomous = await this.control.taskQueue("autonomous");
    const candidates = autonomous
      .filter((item) => ["pending", "ready", "failed", "completed"].includes(item.task.status))
      .slice(0, this.maxTasksPerRun);
    const records: DropHunterAgentRunRecord[] = [];

    for (const item of candidates) {
      records.push(await this.executeOne(item));
    }

    return {
      considered: autonomous.length,
      executed: records.filter((record) => !record.result.note?.startsWith("unsupported:" )).length,
      completed: records.filter((record) => record.result.status === "completed").length,
      failed: records.filter((record) => record.result.status === "failed").length,
      skipped: records.filter((record) => record.result.status === "skipped").length,
      records,
    };
  }

  private async executeOne(item: DropHunterTaskView): Promise<DropHunterAgentRunRecord> {
    const context: DropHunterAgentTaskExecutionContext = {
      projectId: item.projectId,
      projectName: item.projectName,
      projectScore: item.projectScore,
      taskId: item.task.id,
      taskKind: item.task.kind,
      title: item.task.title,
      source: item.task.source,
    };

    if (item.automation.mode !== "autonomous" || !item.automation.canExecute) {
      return this.record(item, { status: "skipped", note: "unsupported: task is not authorized for autonomous execution" });
    }

    const executor = this.executors.get(item.task.kind);
    if (!executor || (executor.supports && !executor.supports(context))) {
      return this.record(item, { status: "skipped", note: `unsupported: no trusted executor configured for ${item.task.kind}` });
    }

    await this.control.setTaskStatus(item.projectId, item.task.id, "running");
    try {
      const result = await executor.execute(context);
      if (result.status === "completed") {
        await this.control.setTaskStatus(item.projectId, item.task.id, "completed", { txHash: result.txHash });
      } else if (result.status === "failed") {
        await this.control.setTaskStatus(item.projectId, item.task.id, "failed", { error: result.note });
      } else {
        await this.control.setTaskStatus(item.projectId, item.task.id, "ready");
      }
      return this.record(item, result);
    } catch (error) {
      const note = error instanceof Error ? error.message : String(error);
      await this.control.setTaskStatus(item.projectId, item.task.id, "failed", { error: note });
      return this.record(item, { status: "failed", note });
    }
  }

  private record(item: DropHunterTaskView, result: DropHunterAgentTaskExecutionResult): DropHunterAgentRunRecord {
    return { projectId: item.projectId, taskId: item.task.id, kind: item.task.kind, automation: item.automation.mode, result };
  }
}

export class NoopCheckInExecutor implements DropHunterAgentTaskExecutor {
  readonly kinds = ["check-in"] as const;
  supports(): boolean { return false; }
  async execute(context: DropHunterAgentTaskExecutionContext): Promise<DropHunterAgentTaskExecutionResult> {
    return { status: "skipped", note: `unsupported: no concrete check-in adapter configured for ${context.projectName}` };
  }
}
