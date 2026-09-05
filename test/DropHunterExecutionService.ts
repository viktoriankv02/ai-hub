import { expect } from "chai";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionExecutionAdapter, ExecutionAdapterRegistry } from "../agents/drop-hunter/execution-adapter.js";
import { ExecutionGate } from "../agents/drop-hunter/execution-gate.js";
import { ExecutionReceiptStore } from "../agents/drop-hunter/execution-idempotency.js";
import { DropHunterExecutionService } from "../agents/drop-hunter/execution-service.js";
import type { PlannedAction } from "../agents/drop-hunter/action-planner.js";

const action: PlannedAction = {
  id: "register-chain",
  label: "Register target chain",
  risk: "low",
  requiresWallet: true,
  requiresGas: true,
  automated: true,
  completed: false,
};

const approved = {
  allowed: true,
  requiresConfirmation: false,
  reason: "execution satisfies the configured policy",
};

type HandlerResult = {
  status: "success" | "failed";
  txHash?: string;
  txHashes?: string[];
  note?: string;
};

function createService(handler: (action: PlannedAction) => HandlerResult, receiptStoreFile?: string) {
  const registry = new ExecutionAdapterRegistry();
  registry.register(new ActionExecutionAdapter("register-chain-adapter", [action.id], handler));
  return {
    service: new DropHunterExecutionService(registry, {
      gate: new ExecutionGate(),
      ...(receiptStoreFile ? { receiptStoreFile } : { receipts: new ExecutionReceiptStore() }),
    }),
    registry,
  };
}

describe("DropHunterExecutionService", () => {
  it("blocks execution when the live wallet context no longer satisfies approval", async () => {
    let invoked = false;
    const { service } = createService(() => {
      invoked = true;
      return { status: "success", txHash: "0xnever" };
    });

    const run = await service.executeOpportunityAction({
      opportunityId: "opportunity-wallet-change",
      action,
      approval: approved,
      context: {
        mode: "execute",
        timestamp: "2026-09-05T11:00:00Z",
        chainId: 84532,
        walletConnected: false,
        gasAvailable: true,
      },
    });

    expect(invoked).to.equal(false);
    expect(run.event.status).to.equal("skipped");
    expect(run.event.note).to.equal("wallet connection is required");
    expect(service.receipts.list()).to.have.length(0);
  });

  it("reserves the action before invoking the adapter and prevents a duplicate submission", async () => {
    let invocations = 0;
    const { service } = createService(() => {
      invocations += 1;
      return { status: "success", txHash: "0xsubmitted" };
    });

    const request = {
      opportunityId: "opportunity-duplicate",
      action,
      approval: approved,
      account: "0x0000000000000000000000000000000000000001",
      payloadFingerprint: "preview:stable",
      context: {
        mode: "execute" as const,
        timestamp: "2026-09-05T11:05:00Z",
        chainId: 84532,
        walletConnected: true,
        walletAddress: "0x0000000000000000000000000000000000000001",
        gasAvailable: true,
      },
    };

    const first = await service.executeOpportunityAction(request);
    const second = await service.executeOpportunityAction({
      ...request,
      context: { ...request.context, timestamp: "2026-09-05T11:06:00Z" },
    });

    expect(first.event.status).to.equal("success");
    expect(first.event.txHash).to.equal("0xsubmitted");
    expect(second.event.status).to.equal("skipped");
    expect(second.event.note).to.match(/^execution already reserved \(already-submitted;/);
    expect(invocations).to.equal(1);
    expect(service.receipts.list()).to.have.length(1);
    expect(service.receipts.list()[0]?.status).to.equal("submitted");
  });

  it("keeps receipt identity tied to opportunity, action, chain, account and payload", async () => {
    const { service } = createService(() => ({ status: "success", txHash: "0xtx" }));
    const baseContext = {
      mode: "execute" as const,
      timestamp: "2026-09-05T11:10:00Z",
      chainId: 84532,
      walletConnected: true,
      walletAddress: "0x0000000000000000000000000000000000000001",
      gasAvailable: true,
    };

    await service.executeOpportunityAction({
      opportunityId: "opportunity-identity",
      action,
      approval: approved,
      context: baseContext,
      payloadFingerprint: "preview:a",
    });
    await service.executeOpportunityAction({
      opportunityId: "opportunity-identity",
      action,
      approval: approved,
      context: { ...baseContext, timestamp: "2026-09-05T11:11:00Z" },
      payloadFingerprint: "preview:b",
    });

    expect(service.receipts.list()).to.have.length(2);
  });

  it("restores submitted receipts when the execution service is recreated", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ai-hub-service-receipts-"));
    const filePath = join(directory, "receipts.json");
    try {
      let firstInvocations = 0;
      const first = createService(() => {
        firstInvocations += 1;
        return { status: "success", txHash: "0xpersisted" };
      }, filePath).service;

      const request = {
        opportunityId: "opportunity-service-restart",
        action,
        approval: approved,
        context: {
          mode: "execute" as const,
          timestamp: "2026-09-05T11:20:00Z",
          chainId: 84532,
          walletConnected: true,
          walletAddress: "0x0000000000000000000000000000000000000001",
          gasAvailable: true,
        },
        account: "0x0000000000000000000000000000000000000001",
        payloadFingerprint: "preview:restart-safe",
      };

      const firstRun = await first.executeOpportunityAction(request);
      expect(firstInvocations).to.equal(1);
      expect(firstRun.event.status).to.equal("success");

      let restartedInvocations = 0;
      const restarted = createService(() => {
        restartedInvocations += 1;
        return { status: "success", txHash: "0xshould-not-send" };
      }, filePath).service;

      const secondRun = await restarted.executeOpportunityAction({
        ...request,
        context: { ...request.context, timestamp: "2026-09-05T11:21:00Z" },
      });

      expect(restartedInvocations).to.equal(0);
      expect(secondRun.event.status).to.equal("skipped");
      expect(secondRun.event.note).to.match(/^execution already reserved \(already-submitted;/);
      expect(restarted.receipts.list()[0]?.txHash).to.equal("0xpersisted");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reconciles a submitted receipt without creating a new execution reservation", async () => {
    const { service } = createService(() => ({ status: "success", txHash: "0xconfirm-me" }));
    const run = await service.executeOpportunityAction({
      opportunityId: "opportunity-reconcile",
      action,
      approval: approved,
      context: {
        mode: "execute",
        timestamp: "2026-09-05T11:30:00Z",
        chainId: 84532,
        walletConnected: true,
        walletAddress: "0x0000000000000000000000000000000000000001",
        gasAvailable: true,
      },
      account: "0x0000000000000000000000000000000000000001",
      payloadFingerprint: "preview:reconcile",
    });

    const key = service.receipts.list()[0]?.idempotencyKey;
    expect(key).to.be.a("string");
    expect(service.receipts.list()[0]?.status).to.equal("submitted");

    let confirmations = 0;
    const confirmed = await service.reconcileSubmittedReceipt(key as string, "2026-09-05T11:31:00Z", {
      async confirm(txHash) {
        confirmations += 1;
        expect(txHash).to.equal("0xconfirm-me");
        return {
          status: "confirmed",
          txHash,
          note: "transaction confirmed on-chain",
        };
      },
    });

    expect(run.event.status).to.equal("success");
    expect(confirmations).to.equal(1);
    expect(confirmed.status).to.equal("confirmed");
    expect(confirmed.txHash).to.equal("0xconfirm-me");
  });

  it("reconciles every submitted hash in a multi-call receipt", async () => {
    const { service } = createService(() => ({
      status: "success",
      txHash: "0xtx2",
      txHashes: ["0xtx1", "0xtx2"],
    }));

    await service.executeOpportunityAction({
      opportunityId: "opportunity-batch-reconcile",
      action,
      approval: approved,
      context: {
        mode: "execute",
        timestamp: "2026-09-05T11:35:00Z",
        chainId: 84532,
        walletConnected: true,
        gasAvailable: true,
      },
      account: "0x0000000000000000000000000000000000000001",
      payloadFingerprint: "preview:batch-reconcile",
    });

    const receipt = service.receipts.list()[0]!;
    expect(receipt.txHashes).to.deep.equal(["0xtx1", "0xtx2"]);

    const confirmedHashes: string[] = [];
    const confirmed = await service.reconcileSubmittedReceipt(receipt.idempotencyKey, "2026-09-05T11:36:00Z", {
      async confirm(txHash) {
        confirmedHashes.push(txHash);
        return { status: "confirmed", txHash, note: "confirmed" };
      },
    });

    expect(confirmed.status).to.equal("confirmed");
    expect(confirmed.txHashes).to.deep.equal(["0xtx1", "0xtx2"]);
    expect(confirmedHashes).to.deep.equal(["0xtx1", "0xtx2"]);
  });

  it("treats mixed batch outcomes as unknown instead of retryable failure", async () => {
    const { service } = createService(() => ({
      status: "success",
      txHashes: ["0xtx-confirmed", "0xtx-failed"],
      txHash: "0xtx-failed",
    }));

    await service.executeOpportunityAction({
      opportunityId: "opportunity-batch-mixed",
      action,
      approval: approved,
      context: {
        mode: "execute",
        timestamp: "2026-09-05T11:37:00Z",
        chainId: 84532,
        walletConnected: true,
        gasAvailable: true,
      },
      account: "0x0000000000000000000000000000000000000001",
      payloadFingerprint: "preview:batch-mixed",
    });

    const receipt = service.receipts.list()[0]!;
    const reconciled = await service.reconcileSubmittedReceipt(receipt.idempotencyKey, "2026-09-05T11:38:00Z", {
      async confirm(txHash) {
        return txHash === "0xtx-confirmed"
          ? { status: "confirmed", txHash, note: "confirmed" }
          : { status: "failed", txHash, note: "reverted" };
      },
    });

    expect(reconciled.status).to.equal("unknown");
    const retry = service.receipts.reserve(
      {
        opportunityId: "opportunity-batch-mixed",
        actionId: action.id,
        chainId: 84532,
        account: "0x0000000000000000000000000000000000000001",
        payloadFingerprint: "preview:batch-mixed",
      },
      "2026-09-05T11:39:00Z",
    );
    expect(retry.reserved).to.equal(false);
    expect(retry.reason).to.equal("already-unknown");
  });

  it("keeps an unknown reconciliation outcome non-retryable", async () => {
    const { service } = createService(() => ({ status: "success", txHash: "0xunknown" }));
    await service.executeOpportunityAction({
      opportunityId: "opportunity-unknown",
      action,
      approval: approved,
      context: {
        mode: "execute",
        timestamp: "2026-09-05T11:40:00Z",
        chainId: 84532,
        walletConnected: true,
        walletAddress: "0x0000000000000000000000000000000000000001",
        gasAvailable: true,
      },
      payloadFingerprint: "preview:unknown",
    });

    const receipt = service.receipts.list()[0];
    const reconciled = await service.reconcileSubmittedReceipt(receipt!.idempotencyKey, "2026-09-05T11:41:00Z", {
      async confirm() {
        return { status: "unknown", note: "transaction receipt is not available yet" };
      },
    });

    expect(reconciled.status).to.equal("unknown");
    const retry = service.receipts.reserve(
      {
        opportunityId: "opportunity-unknown",
        actionId: action.id,
        chainId: 84532,
        account: "0x0000000000000000000000000000000000000001",
        payloadFingerprint: "preview:unknown",
      },
      "2026-09-05T11:42:00Z",
    );
    expect(retry.reserved).to.equal(false);
    expect(retry.reason).to.equal("already-unknown");
  });
});
