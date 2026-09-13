import { expect } from "chai";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DropHunterProjectRepository,
  JsonFileDropHunterProductStore,
  MemoryDropHunterProductStore,
} from "../agents/drop-hunter/product-store.js";
import type { DropTask } from "../agents/drop-hunter/task-model.js";
import type { ScoredOpportunity } from "../agents/drop-hunter/types.js";

const opportunity = (): ScoredOpportunity => ({
  id: "project-1",
  name: "Project One",
  vm: "EVM",
  stage: "testnet",
  priority: 8,
  signals: { rewardSignals: 8 },
  sources: ["github"],
  actions: ["check-in"],
  score: 84,
  confidence: 0.82,
  reasons: ["active testnet"],
});

const task = (id = "check-in"): DropTask => ({
  id,
  opportunityId: "project-1",
  title: "Daily check-in",
  description: "Complete the project check-in",
  kind: "check-in",
  risk: "low",
  automated: true,
  requiresWallet: false,
  requiresGas: false,
  requiresUserApproval: false,
  recurrence: "daily",
  prerequisites: [],
  evidenceRequired: ["completion"],
  source: "docs",
});

describe("DropHunterProjectRepository", () => {
  it("creates and updates a project without losing task execution state", async () => {
    let now = new Date("2026-09-10T10:00:00.000Z");
    const store = new MemoryDropHunterProductStore();
    const repository = new DropHunterProjectRepository(store, () => now);

    const first = await repository.upsert({ opportunity: opportunity(), tasks: [task()] });
    expect(first.status).to.equal("new");
    expect(first.tasks[0].status).to.equal("pending");
    expect(first.tasks[0].attempts).to.equal(0);

    await repository.setTaskStatus("project-1", "check-in", "running");
    now = new Date("2026-09-11T10:00:00.000Z");
    const updated = await repository.upsert({
      opportunity: { ...opportunity(), score: 90 },
      tasks: [{ ...task(), rewardHint: "points" }],
    });

    expect(updated.opportunity.score).to.equal(90);
    expect(updated.tasks[0].status).to.equal("running");
    expect(updated.tasks[0].attempts).to.equal(1);
    expect(updated.tasks[0].rewardHint).to.equal("points");
    expect(updated.firstSeenAt).to.equal("2026-09-10T10:00:00.000Z");
    expect(updated.lastSeenAt).to.equal("2026-09-11T10:00:00.000Z");
  });

  it("records completion evidence and project status", async () => {
    const store = new MemoryDropHunterProductStore();
    const repository = new DropHunterProjectRepository(store, () => new Date("2026-09-10T12:00:00.000Z"));
    await repository.upsert({ opportunity: opportunity(), tasks: [task()] });

    await repository.setTaskStatus("project-1", "check-in", "completed", { txHash: "0xabc" });
    await repository.setProjectStatus("project-1", "active");

    const project = await store.getProject("project-1");
    expect(project?.status).to.equal("active");
    expect(project?.tasks[0].completedAt).to.equal("2026-09-10T12:00:00.000Z");
    expect(project?.tasks[0].txHashes).to.deep.equal(["0xabc"]);
  });

  it("persists projects across JSON store instances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "drop-hunter-product-"));
    const filePath = join(directory, "projects.json");
    try {
      const firstStore = new JsonFileDropHunterProductStore(filePath);
      const repository = new DropHunterProjectRepository(firstStore);
      await repository.upsert({ opportunity: opportunity(), tasks: [task()] });

      const secondStore = new JsonFileDropHunterProductStore(filePath);
      const reloaded = await secondStore.getProject("project-1");
      expect(reloaded?.opportunity.name).to.equal("Project One");
      expect(reloaded?.tasks[0].kind).to.equal("check-in");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
