import { expect } from "chai";
import type { MultiChainExecutionPlan } from "../agents/multi-chain/execution-planner.js";
import { MemoryExecutionPlanStore } from "../agents/multi-chain/execution-store.js";
import {
  DurableExecutionLedger,
  MemoryExecutionLedgerStore,
} from "../agents/multi-chain/execution-ledger.js";
import {
  ExecutionRecoveryCoordinator,
  ExecutionRecoveryPolicy,
  type ReceiptReconciler,
} from "../agents/multi-chain/execution-recovery.js";
import { PersistentExecutionRecoveryService } from "../agents/multi-chain/persistent-execution-recovery.js";

const NOW = "2026-09-10T18:00:00.000Z";

function plan(): MultiChainExecutionPlan {
  const action = {
    id: "deploy-core",
    label: "Deploy core",
    risk: "low" as const,
    requiresWallet: false,
    requiresGas: false,
    automated: true,
    completed: false,
  };

  return {
    opportunityId: "opp-1",
    createdAt: NOW,
    executable: true,
    blockers: [],
    nodes: [
      {
        id: "deploy-core",
        action,
        actionKind: "deploy-contract",
        dependencyIds: [],
        chainKey: "baseSepolia",
        idempotencyKey: "drop-hunter:opp-1:deploy-core",
        status: "ready",
        blockers: [],
      },
      {
        id: "verify-contract",
        action: { ...action, id: "verify-contract", label: "Verify contract" },
        actionKind: "verify-contract",
        dependencyIds: ["deploy-core"],
        chainKey: "baseSepolia",
        idempotencyKey: "drop-hunter:opp-1:verify-contract",
        status: "blocked",
        blockers: ["dependency:deploy-core"],
      },
    ],
  };
}

async function seedPlan(store: MemoryExecutionPlanStore, value = plan()) {
  await store.put({
    planId: "plan-1",
    plan: value,
    records: [],
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  });
}

function service(
  store: MemoryExecutionPlanStore,
  ledger: DurableExecutionLedger,
  reconciler?: ReceiptReconciler,
) {
  return new PersistentExecutionRecoveryService(
    store,
    ledger,
    new ExecutionRecoveryCoordinator(
      new ExecutionRecoveryPolicy({
        maxAttempts: 3,
        reservedGraceMs: 1_000,
        submittedGraceMs: 1_000,
        now: () => new Date(NOW),
      }),
      reconciler,
    ),
    { now: () => new Date(NOW) },
  );
}

describe("PersistentExecutionRecoveryService", () => {
  it("marks a node completed when the durable ledger is confirmed", async () => {
    const store = new MemoryExecutionPlanStore();
    await seedPlan(store);
    const ledger = new DurableExecutionLedger(new MemoryExecutionLedgerStore(), () => new Date(NOW));
    await ledger.reserve("drop-hunter:opp-1:deploy-core", "deploy-core", "baseSepolia");
    await ledger.markConfirmed("drop-hunter:opp-1:deploy-core", NOW, "confirmed earlier");

    const result = await service(store, ledger).recover("plan-1");

    expect(result.changed).to.equal(true);
    expect(result.plan.nodes[0].status).to.equal("completed");
    expect(result.plan.nodes[0].action.completed).to.equal(true);
    expect(result.plan.nodes[1].status).to.equal("ready");
    expect(result.plan.nodes[1].blockers).to.deep.equal([]);
  });

  it("reconciles a submitted transaction to confirmed without retrying", async () => {
    const store = new MemoryExecutionPlanStore();
    await seedPlan(store);
    const ledger = new DurableExecutionLedger(new MemoryExecutionLedgerStore(), () => new Date(NOW));
    const reservation = await ledger.reserve("drop-hunter:opp-1:deploy-core", "deploy-core", "baseSepolia");
    await ledger.recordResult(reservation.entry.key, {
      status: "success",
      actionId: "deploy-core",
      chainKey: "baseSepolia",
      timestamp: NOW,
      txHash: "0xabc",
    });

    let calls = 0;
    const reconciler: ReceiptReconciler = {
      async reconcile() {
        calls += 1;
        return "confirmed";
      },
    };

    const result = await service(store, ledger, reconciler).recover("plan-1");

    expect(calls).to.equal(1);
    expect(result.nodes[0].action).to.equal("completed");
    expect((await ledger.get(reservation.entry.key))?.status).to.equal("confirmed");
  });

  it("makes a failed node retry-ready while attempts remain", async () => {
    const store = new MemoryExecutionPlanStore();
    const value = plan();
    value.nodes[0].status = "failed";
    value.nodes[0].blockers = ["execution-failed:rpc timeout"];
    await seedPlan(store, value);

    const ledger = new DurableExecutionLedger(new MemoryExecutionLedgerStore(), () => new Date(NOW));
    const reservation = await ledger.reserve("drop-hunter:opp-1:deploy-core", "deploy-core", "baseSepolia");
    await ledger.markFailed(reservation.entry.key, NOW, "rpc timeout");

    const result = await service(store, ledger).recover("plan-1");

    expect(result.nodes[0].action).to.equal("retry-ready");
    expect(result.plan.nodes[0].status).to.equal("ready");
    expect((await ledger.get(reservation.entry.key))?.status).to.equal("failed");
  });

  it("blocks submitted transactions that are still pending", async () => {
    const store = new MemoryExecutionPlanStore();
    await seedPlan(store);
    const ledger = new DurableExecutionLedger(new MemoryExecutionLedgerStore(), () => new Date(NOW));
    const reservation = await ledger.reserve("drop-hunter:opp-1:deploy-core", "deploy-core", "baseSepolia");
    await ledger.recordResult(reservation.entry.key, {
      status: "success",
      actionId: "deploy-core",
      chainKey: "baseSepolia",
      timestamp: NOW,
      txHash: "0xpending",
    });

    const reconciler: ReceiptReconciler = { async reconcile() { return "pending"; } };
    const result = await service(store, ledger, reconciler).recover("plan-1");

    expect(result.nodes[0].action).to.equal("blocked");
    expect(result.plan.nodes[0].status).to.equal("blocked");
    expect(result.plan.nodes[0].blockers[0]).to.contain("recovery:wait:");
    expect(result.plan.nodes[1].status).to.equal("blocked");
  });

  it("persists recovery changes and increments state version", async () => {
    const store = new MemoryExecutionPlanStore();
    await seedPlan(store);
    const ledger = new DurableExecutionLedger(new MemoryExecutionLedgerStore(), () => new Date(NOW));
    await ledger.reserve("drop-hunter:opp-1:deploy-core", "deploy-core", "baseSepolia");
    await ledger.markConfirmed("drop-hunter:opp-1:deploy-core", NOW);

    await service(store, ledger).recover("plan-1");
    const persisted = await store.get("plan-1");

    expect(persisted?.version).to.equal(2);
    expect(persisted?.plan.nodes[0].status).to.equal("completed");
    expect(persisted?.plan.nodes[1].status).to.equal("ready");
  });
});
