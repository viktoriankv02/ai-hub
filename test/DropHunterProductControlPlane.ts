import { expect } from "chai";
import {
  DropHunterProductControlPlane,
  DropHunterProjectRepository,
  DropTaskAutomationPolicy,
  MemoryDropHunterProductStore,
} from "../agents/drop-hunter/index.js";
import type { ScoredOpportunity } from "../agents/drop-hunter/types.js";
import type { DropTask } from "../agents/drop-hunter/task-model.js";

const opportunity: ScoredOpportunity = {
  id: "project-1",
  name: "Project One",
  chainId: 84532,
  vm: "EVM",
  stage: "testnet",
  priority: 90,
  signals: { rewardSignals: 80 },
  sources: ["github"],
  actions: ["daily check-in", "bridge"],
  score: 91,
  confidence: 0.9,
  reasons: ["test"],
};

const tasks: DropTask[] = [
  {
    id: "checkin",
    opportunityId: opportunity.id,
    title: "Daily check-in",
    description: "Daily check-in",
    kind: "check-in",
    risk: "low",
    automated: true,
    requiresWallet: false,
    requiresGas: false,
    requiresUserApproval: false,
    prerequisites: [],
    evidenceRequired: [],
    source: "docs",
  },
  {
    id: "bridge",
    opportunityId: opportunity.id,
    title: "Bridge funds",
    description: "Bridge funds",
    kind: "bridge",
    risk: "medium",
    automated: true,
    requiresWallet: true,
    requiresGas: true,
    requiresUserApproval: true,
    prerequisites: [],
    evidenceRequired: ["transaction hash"],
    source: "docs",
  },
];

describe("DropHunterProductControlPlane", () => {
  it("summarizes projects and splits autonomous vs approval tasks", async () => {
    const store = new MemoryDropHunterProductStore();
    const repository = new DropHunterProjectRepository(store, () => new Date("2026-09-10T12:00:00.000Z"));
    await repository.upsert({ opportunity, tasks, intelligence: {
      total: 91,
      confidence: 0.9,
      rewardPotential: 80,
      effort: 70,
      risk: 20,
      freshness: 100,
      reasons: [],
    } });
    const control = new DropHunterProductControlPlane(store, repository);
    const summary = await control.dashboard();
    expect(summary.projects).to.equal(1);
    expect(summary.highScoreProjects).to.equal(1);
    expect(summary.autonomousTasks).to.equal(1);
    expect(summary.approvalTasks).to.equal(1);
  });

  it("returns approval queue and moves explicitly approved tasks to the approved queue", async () => {
    const store = new MemoryDropHunterProductStore();
    const repository = new DropHunterProjectRepository(store);
    await repository.upsert({ opportunity, tasks });
    const control = new DropHunterProductControlPlane(store, repository, undefined, new DropTaskAutomationPolicy());
    const queue = await control.taskQueue("approval");
    expect(queue.map((item) => item.task.id)).to.deep.equal(["bridge"]);

    const approved = await control.approveTask(opportunity.id, "bridge");
    expect(approved.status).to.equal("ready");
    expect((await control.taskQueue("approval")).map((item) => item.task.id)).to.deep.equal([]);
    expect((await control.approvedTaskQueue()).map((item) => item.task.id)).to.deep.equal(["bridge"]);
    expect((await control.dashboard()).approvalTasks).to.equal(0);
  });

  it("keeps manual social tasks out of agent approval execution", async () => {
    const store = new MemoryDropHunterProductStore();
    const repository = new DropHunterProjectRepository(store);
    await repository.upsert({ opportunity, tasks: [{ ...tasks[0], id: "social", kind: "social", automated: false }] });
    const control = new DropHunterProductControlPlane(store, repository);
    let message = "";
    try {
      await control.approveTask(opportunity.id, "social");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).to.contain("manual task cannot be approved");
  });

  it("records task completion evidence and excludes completed tasks from queue", async () => {
    const store = new MemoryDropHunterProductStore();
    const repository = new DropHunterProjectRepository(store);
    await repository.upsert({ opportunity, tasks });
    const control = new DropHunterProductControlPlane(store, repository);
    const completed = await control.setTaskStatus(opportunity.id, "bridge", "completed", { txHash: "0xabc" });
    expect(completed.txHashes).to.deep.equal(["0xabc"]);
    const queue = await control.taskQueue();
    expect(queue.map((item) => item.task.id)).to.deep.equal(["checkin"]);
  });
});
