export type OpportunityLifecycle = "active" | "stale" | "retired";
export type RewardEvidenceStatus = "confirmed" | "unconfirmed" | "contradicted";
export type MonitorConfidence = "low" | "medium" | "high";

export interface OpportunityObservation {
  opportunityId: string;
  name: string;
  score: number;
  observedAt: string;
  lifecycle: OpportunityLifecycle;
  confidence: MonitorConfidence;
  rewardEvidence: RewardEvidenceStatus;
  sourceCount: number;
  recommendedActionIds: string[];
  chainKeys: string[];
  notes?: string[];
}

export interface OpportunitySnapshot extends OpportunityObservation {
  firstSeenAt: string;
  lastSeenAt: string;
  observationCount: number;
  scoreDelta: number;
}

export interface OpportunityMonitorConfig {
  staleAfterMs: number;
  minActionScore: number;
  maxObservationsPerOpportunity: number;
}

export interface MonitorUpdate {
  snapshot: OpportunitySnapshot;
  isNew: boolean;
  scoreChanged: boolean;
  lifecycleChanged: boolean;
  becameActionable: boolean;
}

const DEFAULT_CONFIG: OpportunityMonitorConfig = {
  staleAfterMs: 7 * 24 * 60 * 60 * 1000,
  minActionScore: 60,
  maxObservationsPerOpportunity: 32,
};

const confidenceRank: Record<MonitorConfidence, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function highestConfidence(a: MonitorConfidence, b: MonitorConfidence): MonitorConfidence {
  return confidenceRank[b] > confidenceRank[a] ? b : a;
}

function normalizeTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid observation timestamp: ${value}`);
  }
  return timestamp;
}

function cloneObservation(observation: OpportunityObservation): OpportunityObservation {
  return {
    ...observation,
    recommendedActionIds: [...observation.recommendedActionIds],
    chainKeys: [...observation.chainKeys],
    notes: observation.notes ? [...observation.notes] : undefined,
  };
}

/**
 * Stateful monitor for opportunity discovery. It deliberately stores
 * observations instead of inventing reward claims. A project can be highly
 * actionable while its reward evidence remains unconfirmed.
 */
export class OpportunityMonitor {
  private readonly config: OpportunityMonitorConfig;
  private readonly history = new Map<string, OpportunityObservation[]>();

  constructor(config: Partial<OpportunityMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.staleAfterMs <= 0) throw new Error("staleAfterMs must be positive");
    if (this.config.maxObservationsPerOpportunity <= 0) {
      throw new Error("maxObservationsPerOpportunity must be positive");
    }
  }

  observe(observation: OpportunityObservation): MonitorUpdate {
    const current = this.history.get(observation.opportunityId) ?? [];
    const previous = current[current.length - 1];
    const normalized = cloneObservation({
      ...observation,
      score: clampScore(observation.score),
    });

    const nextHistory = [...current, normalized].slice(-this.config.maxObservationsPerOpportunity);
    this.history.set(observation.opportunityId, nextHistory);

    const snapshot = this.snapshot(observation.opportunityId);
    const scoreChanged = previous ? previous.score !== normalized.score : false;
    const lifecycleChanged = previous ? previous.lifecycle !== normalized.lifecycle : false;
    const wasActionable = previous ? previous.score >= this.config.minActionScore : false;
    const becameActionable = normalized.score >= this.config.minActionScore && !wasActionable;

    return {
      snapshot,
      isNew: !previous,
      scoreChanged,
      lifecycleChanged,
      becameActionable,
    };
  }

  snapshot(opportunityId: string): OpportunitySnapshot {
    const observations = this.history.get(opportunityId);
    if (!observations || observations.length === 0) {
      throw new Error(`Unknown opportunity: ${opportunityId}`);
    }

    const first = observations[0];
    const latest = observations[observations.length - 1];
    return {
      ...cloneObservation(latest),
      firstSeenAt: first.observedAt,
      lastSeenAt: latest.observedAt,
      observationCount: observations.length,
      scoreDelta: latest.score - first.score,
    };
  }

  list(options: { lifecycle?: OpportunityLifecycle; minScore?: number } = {}): OpportunitySnapshot[] {
    const snapshots = [...this.history.keys()].map((id) => this.snapshot(id));
    return snapshots
      .filter((item) => !options.lifecycle || item.lifecycle === options.lifecycle)
      .filter((item) => options.minScore === undefined || item.score >= options.minScore)
      .sort((a, b) => b.score - a.score || b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  actionable(): OpportunitySnapshot[] {
    return this.list({ lifecycle: "active", minScore: this.config.minActionScore });
  }

  refreshStale(now: string): OpportunitySnapshot[] {
    const nowMs = normalizeTimestamp(now);
    const changed: OpportunitySnapshot[] = [];

    for (const [id, observations] of this.history.entries()) {
      const latest = observations[observations.length - 1];
      if (latest.lifecycle !== "active") continue;
      const age = nowMs - normalizeTimestamp(latest.observedAt);
      if (age <= this.config.staleAfterMs) continue;

      const update: OpportunityObservation = {
        ...latest,
        observedAt: now,
        lifecycle: "stale",
        notes: [...(latest.notes ?? []), "Marked stale because no fresh observation arrived within the configured window."],
      };
      this.history.set(id, [...observations, update].slice(-this.config.maxObservationsPerOpportunity));
      changed.push(this.snapshot(id));
    }

    return changed;
  }

  retire(opportunityId: string, observedAt: string, note?: string): OpportunitySnapshot {
    const latest = this.snapshot(opportunityId);
    const update: OpportunityObservation = {
      ...latest,
      observedAt,
      lifecycle: "retired",
      notes: [...(latest.notes ?? []), ...(note ? [note] : [])],
    };
    this.history.set(opportunityId, [...(this.history.get(opportunityId) ?? []), update].slice(-this.config.maxObservationsPerOpportunity));
    return this.snapshot(opportunityId);
  }

  historyFor(opportunityId: string): OpportunityObservation[] {
    return (this.history.get(opportunityId) ?? []).map(cloneObservation);
  }

  size(): number {
    return this.history.size;
  }
}

export function mergeOpportunityConfidence(
  current: MonitorConfidence,
  incoming: MonitorConfidence,
): MonitorConfidence {
  return highestConfidence(current, incoming);
}
