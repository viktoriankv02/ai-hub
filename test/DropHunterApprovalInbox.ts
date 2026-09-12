import { expect } from "chai";
import { DropHunterApprovalInbox } from "../agents/drop-hunter/approval-inbox.js";
import { DropTaskAutomationPolicy } from "../agents/drop-hunter/automation-policy.js";
import { MemoryDropHunterProductStore, type DropHunterProjectRecord, type StoredDropTask } from "../agents/drop-hunter/product-store.js";

const timestamp = "2026-09-12T06:00:00.000Z";

function task(overrides: Partial<StoredDropTask> = {}): StoredDropTask {
  return {
    id: "bridge",
    opportunityId: "project-x",
    title: "Bridge 0.003 ETH",
    description: "Bridge to the new chain",
    kind: "bridge",
    risk: "medium",
    automated: true,
    requiresWallet: true,
    requiresGas: true,
    requiresUserApproval: true,
    estimatedCostUsd: 0.18,
    rewardHint: "High potential value",
    prerequisites: [],
    evidenceRequired: ["transaction hash"],
    source: "https://example.test/docs",
    status: "waiting-approval",
    createdAt: timestamp,
    updatedAt: timestamp,
    attempts: 0,
    ...overrides,
  };
}

function project(tasks: StoredDropTask[], status: DropHunterProjectRecord["status"] = "active"): DropHunterProjectRecord {
  return {
    id: "project-x",
    opportunity: { id: "project-x", name: "Project X", vm: "EVM", chainId: 84532, stage: "testnet", priority: 90, signals: {}, sources: [], actions: [], score: 91, confidence: 0.8, reasons: [] },
    status,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    updatedAt: timestamp,
    tasks,
    tags: [],
  };
}

describe("DropHunterApprovalInbox", () => {
  it("returns actionable approval context", async () => {
    const store = new MemoryDropHunterProductStore();
    await store.putProject(project([task()]));
    const [request] = await new DropHunterApprovalInbox(store, new DropTaskAutomationPolicy()).list();
    expect(request).to.include({ projectName: "Project X", chainId: 84532, risk: "medium", estimatedCostUsd: 0.18, requiresWalletSignature: true, requiresFunds: true });
    expect(request.reasons).to.include("wallet action requires user approval");
  });

  it("omits approved, terminal, autonomous and inactive work", async () => {
    const store = new MemoryDropHunterProductStore();
    await store.putProject(project([
      task({ id: "ready", status: "ready" }),
      task({ id: "done", status: "completed" }),
      task({ id: "check", kind: "check-in", risk: "low", status: "pending", requiresWallet: false, requiresGas: false, requiresUserApproval: false, estimatedCostUsd: 0 }),
    ]));
    expect(await new DropHunterApprovalInbox(store, new DropTaskAutomationPolicy()).list()).to.deep.equal([]);

    await store.putProject(project([task()], "paused"));
    expect(await new DropHunterApprovalInbox(store, new DropTaskAutomationPolicy()).list()).to.deep.equal([]);
  });
});
