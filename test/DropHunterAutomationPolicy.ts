import { expect } from "chai";
import { DropTaskAutomationPolicy } from "../agents/drop-hunter/automation-policy.js";
import type { DropTask } from "../agents/drop-hunter/task-model.js";

const task = (overrides: Partial<DropTask> = {}): DropTask => ({
  id: "task-1",
  opportunityId: "project-1",
  title: "Check in",
  description: "Daily project check-in",
  kind: "check-in",
  risk: "low",
  automated: true,
  requiresWallet: false,
  requiresGas: false,
  requiresUserApproval: false,
  prerequisites: [],
  evidenceRequired: [],
  source: "docs",
  ...overrides,
});

describe("DropTaskAutomationPolicy", () => {
  it("allows low-risk check-ins to execute autonomously", () => {
    const decision = new DropTaskAutomationPolicy().decide(task());
    expect(decision.mode).to.equal("autonomous");
    expect(decision.canExecute).to.equal(true);
    expect(decision.canSchedule).to.equal(true);
  });

  it("requires approval for wallet or gas spending", () => {
    const policy = new DropTaskAutomationPolicy();
    const decision = policy.decide(task({ kind: "contract-call", requiresWallet: true, requiresGas: true }));
    expect(decision.mode).to.equal("approval");
    expect(decision.canExecute).to.equal(false);
    expect(decision.reasons.join(" ")).to.contain("wallet");
    expect(decision.reasons.join(" ")).to.contain("gas");
  });

  it("keeps social participation manual", () => {
    const decision = new DropTaskAutomationPolicy().decide(task({ kind: "social" }));
    expect(decision.mode).to.equal("manual");
    expect(decision.canSchedule).to.equal(false);
  });

  it("supports explicitly allowlisted autonomous on-chain tasks with limits", () => {
    const policy = new DropTaskAutomationPolicy({
      autonomousKinds: ["check-in", "contract-call"],
      allowAutonomousWalletActions: true,
      allowAutonomousGas: true,
      maxAutonomousCostUsd: 0.5,
    });
    const decision = policy.decide(task({
      kind: "contract-call",
      requiresWallet: true,
      requiresGas: true,
      estimatedCostUsd: 0.2,
    }));
    expect(decision.mode).to.equal("autonomous");
    expect(decision.canExecute).to.equal(true);
  });

  it("requires approval when estimated spend exceeds the autonomous limit", () => {
    const policy = new DropTaskAutomationPolicy({
      autonomousKinds: ["bridge"],
      allowAutonomousWalletActions: true,
      allowAutonomousGas: true,
      maxAutonomousCostUsd: 1,
    });
    const decision = policy.decide(task({
      kind: "bridge",
      requiresWallet: true,
      requiresGas: true,
      estimatedCostUsd: 3,
    }));
    expect(decision.mode).to.equal("approval");
    expect(decision.reasons.join(" ")).to.contain("exceeds autonomous limit");
  });
});
