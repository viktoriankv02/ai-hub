import type { ProjectOpportunity, ScoredOpportunity } from "./types.js";
import { planOpportunity, type PlannedAction, type UserExecutionProfile } from "./action-planner.js";
import {
  learnExecutionProfile,
  recordExecution,
  type ExecutionEvent,
  type LearnedExecutionProfile,
} from "./execution-memory.js";
import {
  recordEvidence,
  summarizeEvidence,
  verifiedEvidence,
  type ActionEvidence,
  type EvidenceSummary,
} from "./evidence-engine.js";
import {
  OpportunityMonitor,
  type MonitorUpdate,
  type OpportunityObservation,
  type OpportunitySnapshot,
  type RewardEvidenceStatus,
} from "./opportunity-monitor.js";
import { scoreOpportunity } from "./scorer.js";

export interface DropHunterCycleResult {
  opportunity: ScoredOpportunity;
  snapshot: OpportunitySnapshot;
  monitor: MonitorUpdate;
  actions: PlannedAction[];
  executionProfile: LearnedExecutionProfile;
  evidence: ActionEvidence[];
  verifiedEvidence: ActionEvidence[];
  evidenceSummaries: EvidenceSummary[];
}

export interface DropHunterObserveOptions {
  observedAt: string;
  lifecycle?: OpportunityObservation["lifecycle"];
  confidence?: OpportunityObservation["confidence"];
  rewardEvidence?: RewardEvidenceStatus;
  notes?: string[];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Coordinates the deterministic Drop Hunter loop without performing external
 * side effects. Discovery, scoring, planning, execution memory and evidence
 * remain separate concerns, but this class gives them one integration point.
 */
export class DropHunterEngine {
  private readonly monitor: OpportunityMonitor;
  private executions: ExecutionEvent[] = [];
  private evidence: ActionEvidence[] = [];

  constructor(monitor = new OpportunityMonitor()) {
    this.monitor = monitor;
  }

  observe(
    opportunity: ProjectOpportunity,
    options: DropHunterObserveOptions,
    profile: UserExecutionProfile = {},
  ): DropHunterCycleResult {
    const scored = scoreOpportunity(opportunity);
    const learned = learnExecutionProfile(this.executions);
    const effectiveProfile: UserExecutionProfile = {
      ...learned,
      ...profile,
      completedActionIds: unique([
        ...(learned.completedActionIds ?? []),
        ...(profile.completedActionIds ?? []),
      ]),
    };
    const actions = planOpportunity(scored, effectiveProfile);
    const summaries = scored.actions.map((action) => summarizeEvidence(action, this.evidence));
    const verified = verifiedEvidence(this.evidence);

    const monitorUpdate = this.monitor.observe({
      opportunityId: opportunity.id,
      name: opportunity.name,
      score: scored.score,
      observedAt: options.observedAt,
      lifecycle: options.lifecycle ?? "active",
      confidence: options.confidence ?? "medium",
      rewardEvidence: options.rewardEvidence ?? "unconfirmed",
      sourceCount: opportunity.sources.length,
      recommendedActionIds: actions.map((action) => action.id),
      chainKeys: opportunity.chainId === undefined ? [] : [String(opportunity.chainId)],
      notes: options.notes,
    });

    return {
      opportunity: scored,
      snapshot: monitorUpdate.snapshot,
      monitor: monitorUpdate,
      actions,
      executionProfile: learnExecutionProfile(this.executions),
      evidence: this.evidence.map((item) => ({ ...item })),
      verifiedEvidence: verified.map((item) => ({ ...item })),
      evidenceSummaries: summaries,
    };
  }

  recordExecution(event: ExecutionEvent): ExecutionEvent[] {
    this.executions = recordExecution(this.executions, event);
    return this.executions.map((item) => ({ ...item }));
  }

  recordEvidence(item: ActionEvidence): ActionEvidence[] {
    this.evidence = recordEvidence(this.evidence, item);
    return this.evidence.map((entry) => ({ ...entry }));
  }

  executionProfile(): LearnedExecutionProfile {
    return learnExecutionProfile(this.executions);
  }

  evidenceFor(actionId?: string): ActionEvidence[] {
    const values = actionId
      ? this.evidence.filter((item) => item.actionId === actionId)
      : this.evidence;
    return values.map((item) => ({ ...item }));
  }

  monitorSnapshot(opportunityId: string): OpportunitySnapshot {
    return this.monitor.snapshot(opportunityId);
  }

  actionable(): OpportunitySnapshot[] {
    return this.monitor.actionable();
  }

  refreshStale(now: string): OpportunitySnapshot[] {
    return this.monitor.refreshStale(now);
  }
}
