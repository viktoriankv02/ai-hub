import { expect } from "chai";
import {
  DropHunterProjectOverviewService,
  DropHunterProjectRepository,
  DropTaskAutomationPolicy,
  MemoryDropHunterEvidenceStore,
  MemoryDropHunterProductStore,
  MemoryDropHunterRewardStore,
  createEvidenceRecord,
  type ScoredOpportunity,
} from "../agents/drop-hunter/index.js";
import type { DropTask } from "../agents/drop-hunter/task-model.js";

const opportunity: ScoredOpportunity = {
  id: "overview-project",
  name: "Overview Project",
  vm: "EVM",
  chainId: 84532,
  stage: "testnet",
  priority: 90,
  signals: { rewardSignals: 80 },
  sources: ["docs"],
  actions: ["check in"],
  score: 88,
  confidence: 0.9,
  reasons: [],
};

const task: DropTask = {
  id: "check-in",
  opportunityId: opportunity.id,
  title: "Daily check-in",
  description: "Check in",
  kind: "check-in",
  risk: "low",
  automated: true,
  requiresWallet: false,
  requiresGas: false,
  requiresUserApproval: false,
  prerequisites: [],
  evidenceRequired: [],
  source: "docs",
};

describe("DropHunterProjectOverviewService", () => {
  it("aggregates progress, evidence, rewards and learning for one project", async () => {
    const projects = new MemoryDropHunterProductStore();
    const repository = new DropHunterProjectRepository(projects, () => new Date("2026-09-11T10:00:00.000Z"));
    await repository.upsert({ opportunity, tasks: [task] });
    await repository.setTaskStatus(opportunity.id, task.id, "running");
    await repository.setTaskStatus(opportunity.id, task.id, "completed");

    const evidence = new MemoryDropHunterEvidenceStore();
    await evidence.append(createEvidenceRecord({
      id: "e1",
      timestamp: "2026-09-11T10:05:00.000Z",
      projectId: opportunity.id,
      taskId: task.id,
      taskKind: task.kind,
      outcome: "success",
      rewardOutcome: "rewarded",
      source: "docs",
      chainId: 84532,
    }));

    const rewardStore = new MemoryDropHunterRewardStore();
    await rewardStore.put({
      id: "reward-1",
      projectId: opportunity.id,
      status: "confirmed",
      source: "campaign",
      assetSymbol: "DROP",
      amount: "100",
      estimatedUsd: 25,
      confidence: 0.9,
      detectedAt: "2026-09-11T10:05:00.000Z",
      updatedAt: "2026-09-11T10:05:00.000Z",
    });

    const service = new DropHunterProjectOverviewService(projects, evidence, rewardStore, new DropTaskAutomationPolicy());
    const overview = await service.get(opportunity.id);
    expect(overview?.progress).to.deep.include({ total: 1, completed: 1, percent: 100 });
    expect(overview?.evidence).to.have.length(1);
    expect(overview?.rewardSummary.confirmed).to.equal(1);
    expect(overview?.rewardSummary.confirmedUsd).to.equal(25);
    expect(overview?.learning.rewardedRecords).to.equal(1);
  });
});
