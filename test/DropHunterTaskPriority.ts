import { expect } from "chai";
import { DropTaskAutomationPolicy, prioritizeDropHunterTask } from "../agents/drop-hunter/index.js";
import type { DropTask } from "../agents/drop-hunter/task-model.js";

const base: DropTask = {
  id: "task",
  opportunityId: "project",
  title: "Task",
  description: "Task",
  kind: "check-in",
  risk: "low",
  automated: true,
  requiresWallet: false,
  requiresGas: false,
  requiresUserApproval: false,
  prerequisites: [],
  evidenceRequired: [],
  source: "docs",
};

const policy = new DropTaskAutomationPolicy();

describe("Drop Hunter task priority", () => {
  it("prefers safe autonomous high-signal work", () => {
    const autonomous = prioritizeDropHunterTask({
      projectId: "project",
      projectScore: 90,
      rewardPotential: 85,
      task: base,
      automation: policy.decide(base),
      now: "2026-09-11T00:00:00.000Z",
    });
    const risky: DropTask = { ...base, id: "risky", kind: "bridge", risk: "high", requiresWallet: true, requiresGas: true, requiresUserApproval: true, estimatedCostUsd: 20 };
    const approval = prioritizeDropHunterTask({
      projectId: "project",
      projectScore: 90,
      rewardPotential: 85,
      task: risky,
      automation: policy.decide(risky),
      now: "2026-09-11T00:00:00.000Z",
    });
    expect(autonomous.score).to.be.greaterThan(approval.score);
  });

  it("boosts approaching valid deadlines and penalizes expired tasks", () => {
    const urgent: DropTask = { ...base, id: "urgent", deadline: "2026-09-12T00:00:00.000Z" };
    const expired: DropTask = { ...base, id: "expired", deadline: "2026-09-01T00:00:00.000Z" };
    const input = { projectId: "project", projectScore: 70, rewardPotential: 60, automation: policy.decide(base), now: "2026-09-11T00:00:00.000Z" };
    expect(prioritizeDropHunterTask({ ...input, task: urgent }).score).to.be.greaterThan(prioritizeDropHunterTask({ ...input, task: expired }).score);
  });
});
