import type { MultiChainExecutionPlan } from "./execution-planner.js";
import {
  ExecutionPlanRunner,
  type ExecutionPlanRunRecord,
  type ExecutionPlanRunResult,
} from "./execution-plan-runner.js";
import type {
  ExecutionPlanStore,
  PersistedExecutionState,
} from "./execution-store.js";

export interface PersistentExecutionRunnerOptions {
  now?: () => Date;
}

export class PersistentExecutionPlanRunner {
  private readonly now: () => Date;

  constructor(
    private readonly runner: ExecutionPlanRunner,
    private readonly store: ExecutionPlanStore,
    options: PersistentExecutionRunnerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async initialize(planId: string, plan: MultiChainExecutionPlan): Promise<PersistedExecutionState> {
    if (!planId.trim()) throw new Error("planId cannot be empty");
    const existing = await this.store.get(planId);
    if (existing) return existing;

    const timestamp = this.now().toISOString();
    const state: PersistedExecutionState = {
      planId,
      plan,
      records: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
    };
    await this.store.put(state);
    return (await this.store.get(planId)) ?? state;
  }

  async load(planId: string): Promise<PersistedExecutionState | undefined> {
    return this.store.get(planId);
  }

  async runReady(planId: string): Promise<ExecutionPlanRunResult> {
    return this.run(planId, "ready");
  }

  async runUntilBlocked(planId: string): Promise<ExecutionPlanRunResult> {
    return this.run(planId, "until-blocked");
  }

  async delete(planId: string): Promise<boolean> {
    return this.store.delete(planId);
  }

  private async run(
    planId: string,
    mode: "ready" | "until-blocked",
  ): Promise<ExecutionPlanRunResult> {
    const state = await this.store.get(planId);
    if (!state) throw new Error(`execution plan not found: ${planId}`);

    const result = mode === "ready"
      ? await this.runner.runReady(state.plan)
      : await this.runner.runUntilBlocked(state.plan);

    const nextRecords: ExecutionPlanRunRecord[] = [...state.records, ...result.records];
    const nextState: PersistedExecutionState = {
      ...state,
      plan: result.plan,
      records: nextRecords,
      updatedAt: this.now().toISOString(),
      version: state.version + 1,
    };

    await this.store.put(nextState);
    return result;
  }
}
