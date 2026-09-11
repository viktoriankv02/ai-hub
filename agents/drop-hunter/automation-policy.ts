import type { DropTask } from "./task-model.js";

export type DropTaskExecutionMode = "autonomous" | "approval" | "manual" | "disabled";

export interface DropTaskAutomationDecision {
  mode: DropTaskExecutionMode;
  reasons: string[];
  canSchedule: boolean;
  canExecute: boolean;
}

export interface DropTaskAutomationPolicyOptions {
  enabled?: boolean;
  maxAutonomousCostUsd?: number;
  allowAutonomousGas?: boolean;
  allowAutonomousWalletActions?: boolean;
  autonomousKinds?: readonly DropTask["kind"][];
  manualKinds?: readonly DropTask["kind"][];
}

const DEFAULT_AUTONOMOUS_KINDS: readonly DropTask["kind"][] = [
  "check-in",
  "verify",
  "community",
];

const DEFAULT_MANUAL_KINDS: readonly DropTask["kind"][] = ["social"];

export class DropTaskAutomationPolicy {
  private readonly enabled: boolean;
  private readonly maxAutonomousCostUsd: number;
  private readonly allowAutonomousGas: boolean;
  private readonly allowAutonomousWalletActions: boolean;
  private readonly autonomousKinds: ReadonlySet<DropTask["kind"]>;
  private readonly manualKinds: ReadonlySet<DropTask["kind"]>;

  constructor(options: DropTaskAutomationPolicyOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.maxAutonomousCostUsd = options.maxAutonomousCostUsd ?? 0;
    this.allowAutonomousGas = options.allowAutonomousGas ?? false;
    this.allowAutonomousWalletActions = options.allowAutonomousWalletActions ?? false;
    this.autonomousKinds = new Set(options.autonomousKinds ?? DEFAULT_AUTONOMOUS_KINDS);
    this.manualKinds = new Set(options.manualKinds ?? DEFAULT_MANUAL_KINDS);
    if (!Number.isFinite(this.maxAutonomousCostUsd) || this.maxAutonomousCostUsd < 0) {
      throw new Error("maxAutonomousCostUsd must be a non-negative finite number");
    }
  }

  decide(task: DropTask): DropTaskAutomationDecision {
    const reasons: string[] = [];

    if (!this.enabled) {
      return { mode: "disabled", reasons: ["automation is disabled"], canSchedule: false, canExecute: false };
    }

    if (!task.automated) {
      return { mode: "manual", reasons: ["task is not marked automatable"], canSchedule: false, canExecute: false };
    }

    if (this.manualKinds.has(task.kind)) {
      return { mode: "manual", reasons: [`${task.kind} tasks require manual participation`], canSchedule: false, canExecute: false };
    }

    if (task.risk === "high") reasons.push("high-risk task requires user approval");
    if (task.requiresUserApproval) reasons.push("task explicitly requires user approval");
    if (task.requiresWallet && !this.allowAutonomousWalletActions) reasons.push("wallet action requires user approval");
    if (task.requiresGas && !this.allowAutonomousGas) reasons.push("gas-spending action requires user approval");
    if ((task.estimatedCostUsd ?? 0) > this.maxAutonomousCostUsd) {
      reasons.push(`estimated cost exceeds autonomous limit ($${this.maxAutonomousCostUsd})`);
    }

    if (reasons.length > 0) {
      return { mode: "approval", reasons, canSchedule: true, canExecute: false };
    }

    if (!this.autonomousKinds.has(task.kind)) {
      return {
        mode: "approval",
        reasons: [`${task.kind} is not allowlisted for autonomous execution`],
        canSchedule: true,
        canExecute: false,
      };
    }

    return {
      mode: "autonomous",
      reasons: ["task satisfies autonomous execution policy"],
      canSchedule: true,
      canExecute: true,
    };
  }
}
