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
import type { PersistentExecutionRecoveryService } from "./persistent-execution-recovery.js";

export interface PersistentExecutionRunnerOptions {
  now?: () => Date;
  recoveryService?: PersistentExecutionRecoveryService;
  recoverBeforeRun?: boolean;
}

export class PersistentExecutionPlanRunner {
  private readonly now: () => Date;
  private readonly recoveryService?: PersistentExecutionRecoveryService;
  private readonly recoverBeforeRun: boolean;

  constructor(
    private readonly runner: ExecutionPlanRunner,
    private readonly store: ExecutionPlanStore,
    options: PersistentExecutionRunnerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.recoveryService = options.recoveryService;
    this.recoverBeforeRun = options.recoverBeforeRun ?? Boolean(options.recoveryService);
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

  async recover(planId: string): Promise<PersistedExecutionState> {
    if (!this.recoveryService) throw new Error("persistent recovery service is not configured");
    await this.recoveryService.recover(planId);
    const state = await this.store.get(planId);
    if (!state) throw new Error(`execution plan not found after recovery: ${planId}`);
    return state;
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
    if (this.recoverBeforeRun && this.recoveryService) {
      await this.recoveryService.recover(planId);
    }

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
