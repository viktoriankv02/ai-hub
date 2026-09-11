import { expect } from "chai";
import { DropHunterAttentionQueue } from "../agents/drop-hunter/attention-queue.js";
import type { DropHunterProjectRecord, StoredDropTask } from "../agents/drop-hunter/product-store.js";

function task(overrides: Partial<StoredDropTask> = {}): StoredDropTask {
  return {
    id: "task-1",
    opportunityId: "project-1",
    title: "Bridge funds",
    description: "Bridge funds",
    kind: "bridge",
    risk: "medium",
    automated: true,
    requiresWallet: true,
    requiresGas: true,
    requiresUserApproval: true,
    prerequisites: [],
    evidenceRequired: [],
    source: "docs",
    status: "pending",
    createdAt: "2026-09-11T18:00:00.000Z",
    updatedAt: "2026-09-11T18:00:00.000Z",
    attempts: 0,
    ...overrides,
  };
}

function project(tasks: StoredDropTask[]): DropHunterProjectRecord {
  return {
    id: "project-1",
    opportunity: {
      id: "project-1",
      name: "Project One",
      vm: "EVM",
      stage: "testnet",
      priority: 90,
      signals: {},
      sources: ["docs"],
      actions: [],
      score: 90,
      confidence: 0.9,
      reasons: [],
    },
    status: "active",
    firstSeenAt: "2026-09-11T18:00:00.000Z",
    lastSeenAt: "2026-09-11T18:00:00.000Z",
    updatedAt: "2026-09-11T18:00:00.000Z",
    tasks,
    tags: [],
  };
}

describe("DropHunterAttentionQueue", () => {
  it("surfaces wallet-gated tasks", () => {
    const items = new DropHunterAttentionQueue().build([project([task()])]);
    expect(items).to.have.length(1);
    expect(items[0].reason).to.equal("wallet");
    expect(items[0].severity).to.equal("warning");
  });

  it("prioritizes failed tasks as critical", () => {
    const failed = task({ id: "failed", status: "failed", lastError: "RPC unavailable", requiresWallet: false, requiresGas: false, requiresUserApproval: false, kind: "check-in", risk: "low" });
    const items = new DropHunterAttentionQueue().build([project([task(), failed])]);
    expect(items[0].taskId).to.equal("failed");
    expect(items[0].reason).to.equal("failed");
    expect(items[0].severity).to.equal("critical");
  });

  it("omits completed and skipped tasks", () => {
    const items = new DropHunterAttentionQueue().build([project([task({ status: "completed" }), task({ id: "skip", status: "skipped" })])]);
    expect(items).to.deep.equal([]);
  });
});
