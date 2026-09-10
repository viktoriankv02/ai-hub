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

describe("runApprovedActions gas revalidation", () => {
  it("does not invoke the handler after gas becomes unavailable", async () => {
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
        timestamp: "2026-09-05T08:00:00Z",
        gate: new ExecutionGate(),
        mode: "execute",
        walletConnected: true,
        gasAvailable: false,
      },
    );

    expect(invoked).to.equal(false);
    expect(run.decision.allowed).to.equal(false);
    expect(run.event.status).to.equal("skipped");
    expect(run.event.note).to.equal("gas availability is required");
  });
});
