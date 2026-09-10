import { expect } from "chai";
import { ExecutionGate } from "../agents/drop-hunter/execution-gate.js";
import { ExecutionReceiptStore } from "../agents/drop-hunter/execution-idempotency.js";
import { runApprovedActions } from "../agents/drop-hunter/execution-runner.js";
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

const baseOptions = {
  timestamp: "2026-09-05T10:00:00Z",
  chainId: 84532,
  gate: new ExecutionGate(),
  mode: "execute" as const,
  walletConnected: true,
  gasAvailable: true,
  idempotency: {
    store: new ExecutionReceiptStore(),
    opportunityId: "opportunity-1",
    account: "0x0000000000000000000000000000000000000001",
    payloadFingerprint: "preview:abc123",
  },
};

describe("runApprovedActions idempotency", () => {
  it("reserves a new execution and records a submitted transaction", async () => {
    const [run] = await runApprovedActions(
      [{ action, decision: approved }],
      { [action.id]: () => ({ status: "success", txHash: "0xtx1" }) },
      baseOptions,
    );

    const receipt = baseOptions.idempotency.store.list()[0];
    expect(run.event.status).to.equal("success");
    expect(run.event.txHash).to.equal("0xtx1");
    expect(receipt?.status).to.equal("submitted");
    expect(receipt?.txHash).to.equal("0xtx1");
    expect(receipt?.txHashes).to.deep.equal(["0xtx1"]);
  });

  it("does not invoke the handler again for an already submitted intent", async () => {
    let invoked = 0;
    const store = new ExecutionReceiptStore();
    const options = { ...baseOptions, idempotency: { ...baseOptions.idempotency, store } };

    await runApprovedActions(
      [{ action, decision: approved }],
      { [action.id]: () => { invoked += 1; return { status: "success", txHash: "0xtx1" }; } },
      options,
    );

    const [run] = await runApprovedActions(
      [{ action, decision: approved }],
      { [action.id]: () => { invoked += 1; return { status: "success", txHash: "0xtx2" }; } },
      { ...options, timestamp: "2026-09-05T10:01:00Z" },
    );

    expect(invoked).to.equal(1);
    expect(run.event.status).to.equal("skipped");
    expect(run.event.note).to.match(/already reserved \(already-submitted/);
    expect(store.list()[0]?.txHash).to.equal("0xtx1");
  });

  it("preserves all submitted hashes for a multi-call execution", async () => {
    const store = new ExecutionReceiptStore();
    const options = { ...baseOptions, idempotency: { ...baseOptions.idempotency, store } };

    const [run] = await runApprovedActions(
      [{ action, decision: approved }],
      {
        [action.id]: () => ({
          status: "success",
          txHash: "0xtx2",
          txHashes: ["0xtx1", "0xtx2"],
          note: "batch submitted",
        }),
      },
      options,
    );

    expect(run.event.txHash).to.equal("0xtx2");
    expect(store.list()[0]?.status).to.equal("submitted");
    expect(store.list()[0]?.txHashes).to.deep.equal(["0xtx1", "0xtx2"]);
  });

  it("allows a retry after a failed handler reservation", async () => {
    const store = new ExecutionReceiptStore();
    const options = { ...baseOptions, idempotency: { ...baseOptions.idempotency, store } };

    const [failed] = await runApprovedActions(
      [{ action, decision: approved }],
      { [action.id]: () => ({ status: "failed", note: "RPC unavailable" }) },
      options,
    );

    expect(failed.event.status).to.equal("failed");
    expect(store.list()[0]?.status).to.equal("failed");

    const [retried] = await runApprovedActions(
      [{ action, decision: approved }],
      { [action.id]: () => ({ status: "success", txHash: "0xtx-retry" }) },
      { ...options, timestamp: "2026-09-05T10:02:00Z" },
    );

    expect(retried.event.status).to.equal("success");
    expect(retried.event.txHash).to.equal("0xtx-retry");
    expect(store.list()[0]?.status).to.equal("submitted");
    expect(store.list()[0]?.txHash).to.equal("0xtx-retry");
  });

  it("blocks retry when a successful handler produces no transaction hash", async () => {
    const store = new ExecutionReceiptStore();
    const options = { ...baseOptions, idempotency: { ...baseOptions.idempotency, store } };

    const [run] = await runApprovedActions(
      [{ action, decision: approved }],
      { [action.id]: () => ({ status: "success", note: "submitted outside runner" }) },
      options,
    );

    expect(run.event.status).to.equal("success");
    expect(store.list()[0]?.status).to.equal("unknown");
    expect(store.list()[0]?.note).to.contain("without a transaction hash");
  });
});
