import { expect } from "chai";
import { ExecutionGate } from "../agents/drop-hunter/execution-gate.js";
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

describe("runApprovedActions", () => {
  it("revalidates a stale approval before invoking the handler", async () => {
    let invoked = false;

    const [run] = await runApprovedActions(
      [{ action, decision: approved }],
      {
        [action.id]: () => {
          invoked = true;
          return { status: "success" };
        },
      },
      {
        timestamp: "2026-09-04T12:00:00Z",
        gate: new ExecutionGate(),
        mode: "execute",
        walletConnected: false,
        gasAvailable: true,
      },
    );

    expect(invoked).to.equal(false);
    expect(run.decision.allowed).to.equal(false);
    expect(run.event.status).to.equal("skipped");
    expect(run.event.note).to.equal("wallet connection is required");
  });

  it("executes when the stored approval still satisfies the current context", async () => {
    let invoked = false;

    const [run] = await runApprovedActions(
      [{ action, decision: approved }],
      {
        [action.id]: () => {
          invoked = true;
          return { status: "success", chainId: 84532, txHash: "0xabc" };
        },
      },
      {
        timestamp: "2026-09-04T12:00:00Z",
        chainId: 84532,
        gate: new ExecutionGate(),
        mode: "execute",
        walletConnected: true,
        gasAvailable: true,
      },
    );

    expect(invoked).to.equal(true);
    expect(run.decision.allowed).to.equal(true);
    expect(run.event.status).to.equal("success");
    expect(run.event.chainId).to.equal(84532);
    expect(run.event.txHash).to.equal("0xabc");
  });
});
