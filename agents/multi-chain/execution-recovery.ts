import type { ExecutionLedgerEntry } from "./execution-ledger.js";

export type RecoveryDecision =
  | "no-op"
  | "confirm"
  | "retry"
  | "wait"
  | "manual-review";

export interface RecoveryAssessment {
  key: string;
  decision: RecoveryDecision;
  reason: string;
  retryable: boolean;
}

export interface ReceiptReconciler {
  reconcile(entry: ExecutionLedgerEntry): Promise<"confirmed" | "failed" | "pending" | "unknown">;
}

export interface RecoveryPolicyOptions {
  maxAttempts?: number;
  submittedGraceMs?: number;
  reservedGraceMs?: number;
  now?: () => Date;
}

export class ExecutionRecoveryPolicy {
  private readonly maxAttempts: number;
  private readonly submittedGraceMs: number;
  private readonly reservedGraceMs: number;
  private readonly now: () => Date;

  constructor(options: RecoveryPolicyOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.submittedGraceMs = options.submittedGraceMs ?? 120_000;
    this.reservedGraceMs = options.reservedGraceMs ?? 60_000;
    this.now = options.now ?? (() => new Date());
  }

  assess(entry: ExecutionLedgerEntry): RecoveryAssessment {
    if (entry.status === "confirmed") {
      return this.result(entry, "no-op", "execution already confirmed", false);
    }

    if (entry.status === "failed") {
      if (entry.attempts >= this.maxAttempts) {
        return this.result(entry, "manual-review", `retry limit reached (${entry.attempts}/${this.maxAttempts})`, false);
      }
      return this.result(entry, "retry", `failed execution may be retried (${entry.attempts}/${this.maxAttempts})`, true);
    }

    if (entry.status === "unknown") {
      return this.result(entry, "manual-review", "execution outcome is unknown and must be reconciled before retry", false);
    }

    const age = Math.max(0, this.now().getTime() - new Date(entry.updatedAt).getTime());
    if (entry.status === "submitted") {
      if (age < this.submittedGraceMs) {
        return this.result(entry, "wait", "submitted transaction is still within confirmation grace period", false);
      }
      return this.result(entry, "manual-review", "submitted transaction exceeded confirmation grace period", false);
    }

    if (age < this.reservedGraceMs) {
      return this.result(entry, "wait", "execution reservation is still active", false);
    }

    if (entry.attempts >= this.maxAttempts) {
      return this.result(entry, "manual-review", `stale reservation reached retry limit (${entry.attempts}/${this.maxAttempts})`, false);
    }
    return this.result(entry, "retry", "stale reservation may be retried", true);
  }

  private result(
    entry: ExecutionLedgerEntry,
    decision: RecoveryDecision,
    reason: string,
    retryable: boolean,
  ): RecoveryAssessment {
    return { key: entry.key, decision, reason, retryable };
  }
}

export interface RecoveryCoordinatorResult {
  entry: ExecutionLedgerEntry;
  assessment: RecoveryAssessment;
  reconciledStatus?: "confirmed" | "failed" | "pending" | "unknown";
}

export class ExecutionRecoveryCoordinator {
  constructor(
    private readonly policy: ExecutionRecoveryPolicy,
    private readonly reconciler?: ReceiptReconciler,
  ) {}

  async assess(entry: ExecutionLedgerEntry): Promise<RecoveryCoordinatorResult> {
    const assessment = this.policy.assess(entry);
    if (!this.reconciler || (entry.status !== "submitted" && entry.status !== "unknown")) {
      return { entry: { ...entry }, assessment };
    }

    const reconciledStatus = await this.reconciler.reconcile(entry);
    if (reconciledStatus === "confirmed") {
      return {
        entry: { ...entry },
        reconciledStatus,
        assessment: {
          key: entry.key,
          decision: "confirm",
          reason: "receipt reconciliation confirmed execution",
          retryable: false,
        },
      };
    }
    if (reconciledStatus === "failed") {
      const failedEntry = { ...entry, status: "failed" as const };
      return {
        entry: failedEntry,
        reconciledStatus,
        assessment: this.policy.assess(failedEntry),
      };
    }
    if (reconciledStatus === "pending") {
      return {
        entry: { ...entry },
        reconciledStatus,
        assessment: {
          key: entry.key,
          decision: "wait",
          reason: "receipt reconciliation reports transaction still pending",
          retryable: false,
        },
      };
    }

    return {
      entry: { ...entry },
      reconciledStatus,
      assessment: {
        key: entry.key,
        decision: "manual-review",
        reason: "receipt reconciliation could not determine execution outcome",
        retryable: false,
      },
    };
  }
}
