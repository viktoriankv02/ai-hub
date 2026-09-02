import type { ScoredOpportunity } from "./types.js";
import type { DiscoveryRegistryOptions, OpportunityDiscoveryRegistry } from "./discovery-registry.js";
import { OpportunityDiscoveryRegistry as Registry } from "./discovery-registry.js";
import type { DiscoverySource } from "./discovery-registry.js";
import { analyzeDropOpportunity, rankDropOpportunities, type DropIntelligenceResult } from "./drop-intelligence.js";

export interface DropHunterAgentOptions extends DiscoveryRegistryOptions {
  maxResults?: number;
  minimumScore?: number;
}

export interface DropHunterAgentResult {
  generatedAt: string;
  results: DropIntelligenceResult[];
  opportunities: ScoredOpportunity[];
  successfulSources: string[];
  failedSources: Array<{ sourceId: string; error: string }>;
}

/**
 * First-class Drop Hunter agent: discover -> normalize -> score -> extract
 * project tasks -> rank. It intentionally stops before signing or spending
 * funds; execution is a separate, approval-gated trust boundary.
 */
export class DropHunterAgent {
  private readonly registry: OpportunityDiscoveryRegistry;
  private readonly maxResults: number;
  private readonly minimumScore: number;

  constructor(sources: DiscoverySource[] = [], options: DropHunterAgentOptions = {}) {
    this.registry = new Registry(sources, options);
    this.maxResults = options.maxResults ?? 25;
    this.minimumScore = options.minimumScore ?? 0;
    if (!Number.isInteger(this.maxResults) || this.maxResults < 1) {
      throw new Error("maxResults must be a positive integer");
    }
    if (!Number.isFinite(this.minimumScore) || this.minimumScore < 0 || this.minimumScore > 100) {
      throw new Error("minimumScore must be between 0 and 100");
    }
  }

  addSource(source: DiscoverySource): void {
    this.registry.add(source);
  }

  async scan(observedAt = new Date().toISOString()): Promise<DropHunterAgentResult> {
    const discovery = await this.registry.discover(observedAt);
    const analyzed = discovery.opportunities
      .map((opportunity) => analyzeDropOpportunity(opportunity, { observedAt }))
      .filter((result) => result.score.total >= this.minimumScore);

    const ranked = rankDropOpportunities(analyzed).slice(0, this.maxResults);
    return {
      generatedAt: observedAt,
      results: ranked,
      opportunities: ranked.map((result) => result.opportunity),
      successfulSources: discovery.successfulSources,
      failedSources: discovery.failedSources,
    };
  }

  sourceStatuses() {
    return this.registry.statuses();
  }
}
