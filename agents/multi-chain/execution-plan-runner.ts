import type { ExecutionPlanNode, MultiChainExecutionPlan } from "./execution-planner.js";
import type { UniversalExecutionResult } from "./types.js";

export interface ExecutionPlanNodeExecutor {
  execute(node: ExecutionPlanNode): Promise<UniversalExecutionResult> | UniversalExecutionResult;
}

export interface ExecutionPlanRunRecord {
  nodeId: string;
  result: UniversalExecutionResult;
}

export interface ExecutionPlanRunResult {
  plan: MultiChainExecutionPlan;
  records: ExecutionPlanRunRecord[];
  completedNodeIds: string[];
  failedNodeIds: string[];
  skippedNodeIds: string[];
  stalled: boolean;
}

function cloneNode(node: ExecutionPlanNode): ExecutionPlanNode {
  return {
    ...node,
    action: { ...node.action },
    dependencyIds: [...node.dependencyIds],
    blockers: [...node.blockers],
  };
}

function clonePlan(plan: MultiChainExecutionPlan): MultiChainExecutionPlan {
  return {
    ...plan,
    nodes: plan.nodes.map(cloneNode),
    blockers: [...plan.blockers],
  };
}

export class ExecutionPlanRunner {
  constructor(private readonly executor: ExecutionPlanNodeExecutor) {}

  readyNodes(plan: MultiChainExecutionPlan): ExecutionPlanNode[] {
    return plan.nodes.filter((node) => node.status === "ready").map(cloneNode);
  }

  async runReady(plan: MultiChainExecutionPlan): Promise<ExecutionPlanRunResult> {
    const nextPlan = clonePlan(plan);
    const records: ExecutionPlanRunRecord[] = [];
    const readyIds = new Set(nextPlan.nodes.filter((node) => node.status === "ready").map((node) => node.id));

    for (const node of nextPlan.nodes) {
      if (!readyIds.has(node.id)) continue;

      const result = await this.executor.execute(cloneNode(node));
      records.push({ nodeId: node.id, result });

      if (result.status === "success") {
        node.status = "completed";
        node.blockers = [];
        node.action.completed = true;
      } else if (result.status === "failed") {
        node.status = "failed";
        node.blockers = [result.note ? `execution-failed:${result.note}` : "execution-failed"];
      }
    }

    this.refresh(nextPlan);
    return this.result(nextPlan, records);
  }

  async runUntilBlocked(plan: MultiChainExecutionPlan): Promise<ExecutionPlanRunResult> {
    let current = clonePlan(plan);
    const records: ExecutionPlanRunRecord[] = [];

    while (current.nodes.some((node) => node.status === "ready")) {
      const pass = await this.runReady(current);
      records.push(...pass.records);
      current = pass.plan;

      if (pass.records.length === 0) break;
      if (pass.records.every((record) => record.result.status !== "success")) break;
    }

    return this.result(current, records);
  }

  private refresh(plan: MultiChainExecutionPlan): void {
    const byId = new Map(plan.nodes.map((node) => [node.id, node]));

    for (const node of plan.nodes) {
      if (node.status === "completed" || node.status === "failed") continue;

      const nonDependencyBlockers = node.blockers.filter((blocker) => !blocker.startsWith("dependency:"));
      const dependencyBlockers = node.dependencyIds.flatMap((dependencyId) => {
        const dependency = byId.get(dependencyId);
        if (!dependency) return [`dependency-missing:${dependencyId}`];
        if (dependency.status === "completed") return [];
        if (dependency.status === "failed") return [`dependency-failed:${dependencyId}`];
        return [`dependency:${dependencyId}`];
      });

      node.blockers = [...nonDependencyBlockers, ...dependencyBlockers];
      node.status = node.blockers.length === 0 ? "ready" : "blocked";
    }

    plan.blockers = plan.nodes.flatMap((node) => node.blockers.map((blocker) => `${node.id}:${blocker}`));
    plan.executable = plan.nodes.every((node) => node.status === "ready" || node.status === "completed");
  }

  private result(
    plan: MultiChainExecutionPlan,
    records: ExecutionPlanRunRecord[],
  ): ExecutionPlanRunResult {
    const completedNodeIds = plan.nodes.filter((node) => node.status === "completed").map((node) => node.id);
    const failedNodeIds = plan.nodes.filter((node) => node.status === "failed").map((node) => node.id);
    const skippedNodeIds = records
      .filter((record) => record.result.status === "skipped")
      .map((record) => record.nodeId);
    const stalled = !plan.nodes.some((node) => node.status === "ready") &&
      plan.nodes.some((node) => node.status !== "completed" && node.status !== "failed");

    return {
      plan,
      records,
      completedNodeIds,
      failedNodeIds,
      skippedNodeIds,
      stalled,
    };
  }
}
