import { expect } from "chai";
import { DropHunterContractDeploymentEngine } from "../agents/drop-hunter/contract-deployment-engine.js";
import type { DropHunterProjectRecord, StoredDropTask } from "../agents/drop-hunter/product-store.js";

function fixture(status: StoredDropTask["status"] = "ready"): { project: DropHunterProjectRecord; task: StoredDropTask } {
  const task: StoredDropTask = {
    id: "deploy-core",
    opportunityId: "builder-project",
    title: "Deploy contract",
    description: "Deploy a developer contract on Base Sepolia",
    kind: "deploy",
    risk: "medium",
    automated: true,
    requiresWallet: true,
    requiresGas: true,
    requiresUserApproval: true,
    prerequisites: [],
    evidenceRequired: ["transaction hash"],
    source: "docs",
    status,
    createdAt: "2026-09-11T12:00:00.000Z",
    updatedAt: "2026-09-11T12:00:00.000Z",
    attempts: 0,
  };
  const project: DropHunterProjectRecord = {
    id: "builder-project",
    opportunity: {
      id: "builder-project",
      name: "Builder Project",
      chainId: 84532,
      vm: "EVM",
      stage: "testnet",
      priority: 90,
      signals: { rewardSignals: 80 },
      sources: ["docs"],
      actions: ["deploy contract"],
      score: 90,
      confidence: 0.9,
      reasons: [],
    },
    status: "active",
    firstSeenAt: "2026-09-11T12:00:00.000Z",
    lastSeenAt: "2026-09-11T12:00:00.000Z",
    updatedAt: "2026-09-11T12:00:00.000Z",
    tasks: [task],
    tags: [],
  };
  return { project, task };
}

describe("DropHunterContractDeploymentEngine", () => {
  it("plans an approved deployment on a configured EVM chain", () => {
    const { project, task } = fixture();
    const engine = new DropHunterContractDeploymentEngine();
    const plan = engine.plan(project, task, { env: { BASE_SEPOLIA_RPC_URL: "https://rpc.example" } });
    expect(plan.chain.key).to.equal("baseSepolia");
    expect(plan.template.id).to.equal("counter");
    expect(plan.request.requiresUserApproval).to.equal(true);
    expect(plan.executable).to.equal(true);
    expect(plan.blockers).to.deep.equal([]);
  });

  it("blocks planning readiness when the chain RPC is missing", () => {
    const { project, task } = fixture();
    const plan = new DropHunterContractDeploymentEngine().plan(project, task, { env: {} });
    expect(plan.executable).to.equal(false);
    expect(plan.blockers).to.include("rpc-missing:BASE_SEPOLIA_RPC_URL");
  });

  it("refuses a deploy task that has not been explicitly approved", () => {
    const { project, task } = fixture("waiting-approval");
    expect(() => new DropHunterContractDeploymentEngine().plan(project, task, { env: {} })).to.throw("explicitly approved");
  });
});
