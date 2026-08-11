export type OpportunitySignal = {
  liveBuilderProgram?: boolean;
  fundedTeam?: boolean;
  recentLaunch?: boolean;
  mainnetLive?: boolean;
  testnetLive?: boolean;
  aiAgentAlignment?: boolean;
  defiAlignment?: boolean;
  developerProgram?: boolean;
  measurableOnchainActivity?: boolean;
  lowExecutionCost?: boolean;
  timeSensitive?: boolean;
};

export type OpportunityInput = {
  name: string;
  chainId?: number;
  signals: OpportunitySignal;
  notes?: string[];
};

export type OpportunityScore = OpportunityInput & {
  score: number;
  priority: "low" | "medium" | "high" | "critical";
  reasons: string[];
};

const WEIGHTS: Record<keyof OpportunitySignal, number> = {
  liveBuilderProgram: 15,
  fundedTeam: 12,
  recentLaunch: 8,
  // Mainnet and testnet are lifecycle alternatives. Each represents the
  // full lifecycle contribution so either live stage can reach the same
  // maximum score for an otherwise equally strong opportunity.
  mainnetLive: 16,
  testnetLive: 16,
  aiAgentAlignment: 12,
  defiAlignment: 8,
  developerProgram: 12,
  measurableOnchainActivity: 10,
  lowExecutionCost: 4,
  timeSensitive: 3,
};

export function scoreOpportunity(input: OpportunityInput): OpportunityScore {
  let score = 0;
  const reasons: string[] = [];

  for (const [key, weight] of Object.entries(WEIGHTS) as [keyof OpportunitySignal, number][]) {
    if (input.signals[key]) {
      score += weight;
      reasons.push(`+${weight} ${key}`);
    }
  }

  const normalized = Math.min(100, score);
  const priority =
    normalized >= 80 ? "critical" : normalized >= 60 ? "high" : normalized >= 35 ? "medium" : "low";

  return {
    ...input,
    score: normalized,
    priority,
    reasons,
  };
}

export function rankOpportunities(inputs: OpportunityInput[]): OpportunityScore[] {
  return inputs
    .map(scoreOpportunity)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
