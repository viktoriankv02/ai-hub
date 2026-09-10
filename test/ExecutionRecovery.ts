import { expect } from "chai";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DurableExecutionLedger,
  JsonFileExecutionLedgerStore,
  MemoryExecutionLedgerStore,
} from "../agents/multi-chain/execution-ledger.js";
import {
  ExecutionRecoveryCoordinator,
  ExecutionRecoveryPolicy,
} from "../agents/multi-chain/execution-recovery.js";

describe("DurableExecutionLedger", function () {
  const now = new Date("2026-09-10T12:00:00.000Z");

  it("reserves a new idempotency key once", async function () {
    const ledger = new DurableExecutionLedger(new MemoryExecutionLedgerStore(), () => now);
    const first = await ledger.reserve("key-1", "deploy-core", "base");
    const second = await ledger.reserve("key-1", "deploy-core", "base");

    expect(first.reserved).to.equal(true);
    expect(first.reason).to.equal("new");
    expect(first.entry.attempts).to.equal(1);
    expect(second.reserved).to.equal(false);
    expect(second.reason).to.equal("in-flight");
  });

  it("allows failed executions to retry and increments attempts", async function () {
    const store = new MemoryExecutionLedgerStore();
    const ledger = new DurableExecutionLedger(store, () => now);
    const first = await ledger.reserve("key-2", "swap", "base");
    await ledger.markFailed(first.entry.key, now.toISOString(), "rpc timeout");
    const retry = await ledger.reserve("key-2", "swap", "base");

    expect(retry.reserved).to.equal(true);
    expect(retry.reason).to.equal("retry");
    expect(retry.entry.attempts).to.equal(2);
    expect(retry.entry.status).to.equal("reserved");
  });

  it("never re-reserves confirmed executions", async function () {
    const ledger = new DurableExecutionLedger(new MemoryExecutionLedgerStore(), () => now);
    const reserved = await ledger.reserve("key-3", "stake", "base");
    await ledger.markConfirmed(reserved.entry.key, now.toISOString());
    const duplicate = await ledger.reserve("key-3", "stake", "base");

    expect(duplicate.reserved).to.equal(false);
    expect(duplicate.reason).to.equal("already-confirmed");
  });

  it("records tx-backed success as submitted", async function () {
    const ledger = new DurableExecutionLedger(new MemoryExecutionLedgerStore(), () => now);
    await ledger.reserve("key-4", "bridge", "base");
    const entry = await ledger.recordResult("key-4", {
      status: "success",
      actionId: "bridge",
      chainKey: "base",
      timestamp: now.toISOString(),
      txHash: "0xabc",
    });

    expect(entry.status).to.equal("submitted");
    expect(entry.txHash).to.equal("0xabc");
  });

  it("persists entries across JSON store instances", async function () {
    const directory = await mkdtemp(join(tmpdir(), "ai-hub-ledger-"));
    try {
      const file = join(directory, "ledger.json");
      const firstLedger = new DurableExecutionLedger(new JsonFileExecutionLedgerStore(file), () => now);
      await firstLedger.reserve("key-json", "deploy-contract", "base");
      await firstLedger.markFailed("key-json", now.toISOString(), "temporary failure");

      const reloaded = new DurableExecutionLedger(new JsonFileExecutionLedgerStore(file), () => now);
      const entry = await reloaded.get("key-json");
      expect(entry?.status).to.equal("failed");
      expect(entry?.note).to.equal("temporary failure");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("ExecutionRecoveryPolicy", function () {
  const now = new Date("2026-09-10T12:05:00.000Z");
  const policy = new ExecutionRecoveryPolicy({
    maxAttempts: 3,
    reservedGraceMs: 60_000,
    submittedGraceMs: 120_000,
    now: () => now,
  });

  const entry = (overrides: Partial<Parameters<typeof policy.assess>[0]> = {}) => ({
    key: "k",
    actionId: "deploy-core",
    chainKey: "base",
    status: "reserved" as const,
    createdAt: "2026-09-10T12:00:00.000Z",
    updatedAt: "2026-09-10T12:00:00.000Z",
    attempts: 1,
    ...overrides,
  });

  it("retries stale reservations", function () {
    const result = policy.assess(entry());
    expect(result.decision).to.equal("retry");
    expect(result.retryable).to.equal(true);
  });

  it("stops retrying after the attempt limit", function () {
    const result = policy.assess(entry({ status: "failed", attempts: 3 }));
    expect(result.decision).to.equal("manual-review");
    expect(result.retryable).to.equal(false);
  });

  it("requires reconciliation for unknown outcomes", function () {
    const result = policy.assess(entry({ status: "unknown" }));
    expect(result.decision).to.equal("manual-review");
  });

  it("uses receipt reconciliation to confirm submitted transactions", async function () {
    const coordinator = new ExecutionRecoveryCoordinator(policy, {
      reconcile: async () => "confirmed",
    });
    const result = await coordinator.assess(entry({ status: "submitted", txHash: "0x123" }));

    expect(result.reconciledStatus).to.equal("confirmed");
    expect(result.assessment.decision).to.equal("confirm");
  });

  it("keeps pending reconciled transactions waiting", async function () {
    const coordinator = new ExecutionRecoveryCoordinator(policy, {
      reconcile: async () => "pending",
    });
    const result = await coordinator.assess(entry({ status: "submitted", txHash: "0x123" }));

    expect(result.assessment.decision).to.equal("wait");
    expect(result.assessment.retryable).to.equal(false);
  });
});
