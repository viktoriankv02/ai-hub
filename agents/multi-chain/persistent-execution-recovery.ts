import type { MultiChainExecutionPlan } from "./execution-planner.js";
import type { ExecutionPlanStore, PersistedExecutionState } from "./execution-store.js";
import { DurableExecutionLedger, type ExecutionLedgerEntry } from "./execution-ledger.js";
import { ExecutionRecoveryCoordinator, type RecoveryCoordinatorResult } from "./execution-recovery.js";

export interface PersistentRecoveryNodeResult {
  nodeId: string;
  idempotencyKey?: string;
  recovery?: RecoveryCoordinatorResult;
  action: "unchanged" | "completed" | "retry-ready" | "blocked";
  note?: string;
}

export interface PersistentRecoveryResult {
  planId: string;
  plan: MultiChainExecutionPlan;
  nodes: PersistentRecoveryNodeResult[];
  changed: boolean;
}

export interface PersistentExecutionRecoveryOptions {
  now?: () => Date;
}

export class PersistentExecutionRecoveryService {
  private readonly now: () => Date;

  constructor(
    private readonly store: ExecutionPlanStore,
    private readonly ledger: DurableExecutionLedger,
    private readonly recovery: ExecutionRecoveryCoordinator,
    options: PersistentExecutionRecoveryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async recover(planId: string): Promise<PersistentRecoveryResult> {
    const state = await this.store.get(planId);
    if (!state) throw new Error(`execution plan not found: ${planId}`);

    const plan = this.clonePlan(state.plan);
    const nodeResults: PersistentRecoveryNodeResult[] = [];
    let changed = false;

    for (const node of plan.nodes) {
      if (node.status === "completed") {
        nodeResults.push({ nodeId: node.id, action: "unchanged" });
        continue;
      }

      const key = node.idempotencyKey.trim();
      const entry = await this.ledger.get(key);
      if (!entry) {
        nodeResults.push({ nodeId: node.id, idempotencyKey: key, action: "unchanged", note: "no durable execution entry" });
        continue;
      }

      const result = await this.recovery.assess(entry);
      const applied = await this.apply(node, entry, result);
      changed = changed || applied.action !== "unchanged";
      nodeResults.push({ nodeId: node.id, idempotencyKey: key, recovery: result, ...applied });
    }

    this.refreshDependencies(plan);

    if (changed) {
      const next: PersistedExecutionState = {
        ...state,
        plan,
        updatedAt: this.now().toISOString(),
        version: state.version + 1,
      };
      await this.store.put(next);
    }

    return { planId, plan, nodes: nodeResults, changed };
  }

  private async apply(
    node: MultiChainExecutionPlan["nodes"][number],
    entry: ExecutionLedgerEntry,
    result: RecoveryCoordinatorResult,
  ): Promise<{ action: PersistentRecoveryNodeResult["action"]; note?: string }> {
    const assessment = result.assessment;

    if (assessment.decision === "confirm") {
      await this.ledger.markConfirmed(entry.key, this.now().toISOString(), assessment.reason);
      node.status = "completed";
      node.action.completed = true;
      node.blockers = [];
      return { action: "completed", note: assessment.reason };
    }

    if (assessment.decision === "no-op" && entry.status === "confirmed") {
      node.status = "completed";
      node.action.completed = true;
      node.blockers = [];
      return { action: "completed", note: assessment.reason };
    }

    if (assessment.decision === "retry") {
      await this.ledger.markFailed(entry.key, this.now().toISOString(), assessment.reason);
      node.status = "ready";
      node.action.completed = false;
      node.blockers = node.blockers.filter((blocker) => !blocker.startsWith("recovery:"));
      return { action: "retry-ready", note: assessment.reason };
    }

    if (assessment.decision === "wait" || assessment.decision === "manual-review") {
      node.status = "blocked";
      node.action.completed = false;
      node.blockers = [
        ...node.blockers.filter((blocker) => !blocker.startsWith("recovery:")),
        `recovery:${assessment.decision}:${assessment.reason}`,
      ];
      return { action: "blocked", note: assessment.reason };
    }

    return { action: "unchanged", note: assessment.reason };
  }

  private refreshDependencies(plan: MultiChainExecutionPlan): void {
    const byId = new Map(plan.nodes.map((node) => [node.id, node]));
    for (const node of plan.nodes) {
      if (node.status === "completed" || node.status === "failed") continue;

      const staticBlockers = node.blockers.filter((blocker) =>
        !blocker.startsWith("dependency:") && !blocker.startsWith("dependency-failed:"),
      );
      const dependencies = node.dependencyIds.flatMap((dependencyId) => {
        const dependency = byId.get(dependencyId);
        if (!dependency) return [`dependency-missing:${dependencyId}`];
        if (dependency.status === "completed") return [];
        if (dependency.status === "failed") return [`dependency-failed:${dependencyId}`];
        return [`dependency:${dependencyId}`];
      });
      node.blockers = [...staticBlockers, ...dependencies];
      node.status = node.blockers.length === 0 ? "ready" : "blocked";
    }

    plan.blockers = plan.nodes.flatMap((node) => node.blockers.map((blocker) => `${node.id}:${blocker}`));
    plan.executable = plan.nodes.every((node) => node.status === "ready" || node.status === "completed");
  }

  private clonePlan(plan: MultiChainExecutionPlan): MultiChainExecutionPlan {
    return {
      ...plan,
      blockers: [...plan.blockers],
      nodes: plan.nodes.map((node) => ({
        ...node,
        action: { ...node.action },
        dependencyIds: [...node.dependencyIds],
        blockers: [...node.blockers],
      })),
    };
  }
}
