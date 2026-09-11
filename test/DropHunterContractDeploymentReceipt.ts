import { expect } from "chai";
import { ContractDeploymentReceiptReconciler } from "../agents/drop-hunter/contract-deployment-receipt.js";
import { DropHunterProjectRepository, MemoryDropHunterProductStore } from "../agents/drop-hunter/product-store.js";
import type { ScoredOpportunity } from "../agents/drop-hunter/types.js";
import type { DropTask } from "../agents/drop-hunter/task-model.js";

const opportunity: ScoredOpportunity = {
  id: "p1",
  name: "Project",
  chainId: 84532,
  vm: "EVM",
  stage: "testnet",
  priority: 90,
  signals: {},
  sources: ["docs"],
  actions: ["deploy contract"],
  score: 90,
  confidence: 0.9,
  reasons: [],
};

const task: DropTask = {
  id: "t1",
  opportunityId: "p1",
  title: "Deploy contract",
  description: "Deploy contract",
  kind: "deploy",
  risk: "medium",
  automated: true,
  requiresWallet: true,
  requiresGas: true,
  requiresUserApproval: true,
  prerequisites: [],
  evidenceRequired: ["transaction hash"],
  source: "docs",
};

const txHash = `0x${"a".repeat(64)}`;
const contractAddress = `0x${"b".repeat(40)}`;

describe("ContractDeploymentReceiptReconciler", () => {
  it("completes the task and persists deployment evidence after success", async () => {
    const store = new MemoryDropHunterProductStore();
    const repository = new DropHunterProjectRepository(store);
    await repository.upsert({ opportunity, tasks: [task] });
    await repository.setTaskStatus("p1", "t1", "running");
    const reconciler = new ContractDeploymentReceiptReconciler(repository, {
      async getReceipt() {
        return { transactionHash: txHash, status: "success", contractAddress, blockNumber: 123 };
      },
    });
    const result = await reconciler.reconcile({ projectId: "p1", taskId: "t1", chainId: 84532, transactionHash: txHash });
    expect(result.status).to.equal("success");
    const stored = await store.getProject("p1");
    expect(stored?.tasks[0].status).to.equal("completed");
    expect(stored?.tasks[0].txHashes).to.deep.equal([txHash]);
    expect(stored?.tasks[0].contractAddresses).to.deep.equal([contractAddress]);
    expect(stored?.tasks[0].lastBlockNumber).to.equal(123);
  });

  it("keeps a pending receipt from changing task state", async () => {
    const store = new MemoryDropHunterProductStore();
    const repository = new DropHunterProjectRepository(store);
    await repository.upsert({ opportunity, tasks: [task] });
    await repository.setTaskStatus("p1", "t1", "running");
    const reconciler = new ContractDeploymentReceiptReconciler(repository, {
      async getReceipt() {
        return { transactionHash: txHash, status: "pending" };
      },
    });
    const result = await reconciler.reconcile({ projectId: "p1", taskId: "t1", chainId: 84532, transactionHash: txHash });
    expect(result.taskUpdated).to.equal(false);
    expect((await store.getProject("p1"))?.tasks[0].status).to.equal("running");
  });
});
