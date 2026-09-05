import { expect } from "chai";
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

function createService(handler: (action: PlannedAction) => { status: "success" | "failed"; txHash?: string }) {
  const registry = new ExecutionAdapterRegistry();
  registry.register(new ActionExecutionAdapter("register-chain-adapter", [action.id], handler));
  return {
    service: new DropHunterExecutionService(registry, {
      gate: new ExecutionGate(),
      receipts: new ExecutionReceiptStore(),
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
});
