import { expect } from "chai";
import {
  DropHunterProductIngestionService,
  DropHunterProjectRepository,
  DropTaskAutomationPolicy,
  MemoryDropHunterProductStore,
  OpportunityDiscoveryRegistry,
  StaticOpportunitySource,
} from "../agents/drop-hunter/index.js";
import type { ProjectOpportunity } from "../agents/drop-hunter/types.js";

const opportunity = (): ProjectOpportunity => ({
  id: "alpha",
  name: "Alpha Network",
  chainId: 84532,
  vm: "EVM",
  stage: "incentivized",
  priority: 9,
  signals: {
    fundingEvidence: 80,
    developerProgram: 90,
    testnetActivity: 85,
    ecosystemActivity: 75,
    rewardSignals: 88,
    userFit: 90,
    timing: 95,
  },
  sources: ["official-docs"],
  actions: ["Daily check-in", "Use faucet", "Bridge to testnet", "Deploy contract"],
});

describe("DropHunterProductIngestionService", () => {
  it("discovers, scores, extracts tasks, assigns automation policy and persists projects", async () => {
    const discovery = new OpportunityDiscoveryRegistry([
      new StaticOpportunitySource("catalog", "Catalog", [opportunity()]),
    ]);
    const store = new MemoryDropHunterProductStore();
    const repository = new DropHunterProjectRepository(store);
    const service = new DropHunterProductIngestionService(
      discovery,
      repository,
      new DropTaskAutomationPolicy(),
      () => new Date("2026-09-10T12:00:00.000Z"),
    );

    const result = await service.ingest({ timestamp: "2026-09-10T12:00:00.000Z" });

    expect(result.projects).to.have.length(1);
    expect(result.projects[0].project.opportunity.id).to.equal("alpha");
    expect(result.projects[0].project.tasks).to.have.length(4);
    expect(result.projects[0].intelligence.score.total).to.be.greaterThan(0);

    const byTitle = new Map(result.projects[0].tasks.map((task) => [task.title, task.automation]));
    expect(byTitle.get("Daily check-in")?.mode).to.equal("autonomous");
    expect(byTitle.get("Use faucet")?.mode).to.equal("approval");
    expect(byTitle.get("Bridge to testnet")?.mode).to.equal("approval");
    expect(byTitle.get("Deploy contract")?.mode).to.equal("approval");

    const persisted = await store.getProject("alpha");
    expect(persisted?.intelligence?.rewardPotential).to.equal(88);
    expect(persisted?.lastSeenAt).to.equal("2026-09-10T12:00:00.000Z");
  });

  it("surfaces source failures without preventing healthy sources from being persisted", async () => {
    const failingSource = {
      id: "broken",
      name: "Broken",
      async discover(): Promise<ProjectOpportunity[]> {
        throw new Error("source offline");
      },
    };
    const discovery = new OpportunityDiscoveryRegistry([
      failingSource,
      new StaticOpportunitySource("healthy", "Healthy", [opportunity()]),
    ]);
    const store = new MemoryDropHunterProductStore();
    const service = new DropHunterProductIngestionService(
      discovery,
      new DropHunterProjectRepository(store),
    );

    const result = await service.ingest({ timestamp: "2026-09-10T12:00:00.000Z" });

    expect(result.projects).to.have.length(1);
    expect(result.warnings).to.include("broken: source offline");
    expect(await store.getProject("alpha")).to.not.equal(undefined);
  });
});
