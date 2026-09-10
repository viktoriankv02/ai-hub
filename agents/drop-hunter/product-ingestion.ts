import type { OpportunityDiscoveryRegistry, DiscoveryBatch } from "./discovery-registry.js";
import { analyzeDropOpportunity, rankDropOpportunities, type DropIntelligenceResult } from "./drop-intelligence.js";
import { DropTaskAutomationPolicy, type DropTaskAutomationDecision } from "./automation-policy.js";
import { DropHunterProjectRepository, type DropHunterProjectRecord } from "./product-store.js";

export interface IngestedDropTask {
  taskId: string;
  title: string;
  automation: DropTaskAutomationDecision;
}

export interface IngestedDropProject {
  project: DropHunterProjectRecord;
  intelligence: DropIntelligenceResult;
  tasks: IngestedDropTask[];
}

export interface DropHunterIngestionResult {
  discoveredAt: string;
  discovery: DiscoveryBatch;
  projects: IngestedDropProject[];
  warnings: string[];
}

export interface DropHunterIngestionOptions {
  deadline?: string;
  timestamp?: string;
}

export class DropHunterProductIngestionService {
  constructor(
    private readonly discovery: OpportunityDiscoveryRegistry,
    private readonly repository: DropHunterProjectRepository,
    private readonly automationPolicy: DropTaskAutomationPolicy = new DropTaskAutomationPolicy(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async ingest(options: DropHunterIngestionOptions = {}): Promise<DropHunterIngestionResult> {
    const timestamp = options.timestamp ?? this.now().toISOString();
    const discovery = await this.discovery.discover(timestamp);
    const intelligence = rankDropOpportunities(
      discovery.opportunities.map((opportunity) => analyzeDropOpportunity(opportunity, {
        observedAt: timestamp,
        deadline: options.deadline,
      })),
    );

    const projects: IngestedDropProject[] = [];
    const warnings = discovery.failedSources.map((source) => `${source.sourceId}: ${source.error}`);

    for (const result of intelligence) {
      const project = await this.repository.upsert({
        opportunity: result.opportunity,
        tasks: result.tasks,
        intelligence: result.score,
        timestamp,
      });
      const tasks = result.tasks.map((task) => ({
        taskId: task.id,
        title: task.title,
        automation: this.automationPolicy.decide(task),
      }));
      warnings.push(...result.warnings.map((warning) => `${result.opportunity.id}: ${warning}`));
      projects.push({ project, intelligence: result, tasks });
    }

    return { discoveredAt: timestamp, discovery, projects, warnings };
  }
}
