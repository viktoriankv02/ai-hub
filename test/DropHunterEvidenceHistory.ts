import { expect } from "chai";
import { MemoryDropHunterEvidenceStore, createEvidenceRecord } from "../agents/drop-hunter/evidence-history.js";
import { deriveLearningSignals, learningAdjustment } from "../agents/drop-hunter/learning-signals.js";

describe("Drop Hunter evidence history", () => {
  it("stores evidence by project and task", async () => {
    const store = new MemoryDropHunterEvidenceStore();
    await store.append(createEvidenceRecord({ projectId: "project-a", taskId: "task-1", taskKind: "check-in", outcome: "success", rewardOutcome: "pending", source: "docs", id: "e1", timestamp: "2026-09-11T10:00:00.000Z" }));
    await store.append(createEvidenceRecord({ projectId: "project-b", taskId: "task-2", taskKind: "verify", outcome: "failed", rewardOutcome: "unknown", id: "e2", timestamp: "2026-09-11T11:00:00.000Z" }));
    expect(await store.list()).to.have.length(2);
    expect(await store.listProject("project-a")).to.have.length(1);
    expect(await store.listTask("project-a", "task-1")).to.have.length(1);
  });

  it("derives adaptive success and reward signals", () => {
    const records = [
      createEvidenceRecord({ projectId: "p", taskId: "a", taskKind: "check-in", outcome: "success", rewardOutcome: "rewarded", source: "docs", id: "1", timestamp: "2026-09-11T10:00:00.000Z" }),
      createEvidenceRecord({ projectId: "p", taskId: "b", taskKind: "check-in", outcome: "success", rewardOutcome: "not-rewarded", source: "docs", id: "2", timestamp: "2026-09-11T11:00:00.000Z" }),
      createEvidenceRecord({ projectId: "p", taskId: "c", taskKind: "check-in", outcome: "failed", rewardOutcome: "unknown", source: "docs", id: "3", timestamp: "2026-09-11T12:00:00.000Z" }),
    ];
    const signals = deriveLearningSignals(records);
    expect(signals.taskKindSuccessRate["check-in"]).to.equal(0.6667);
    expect(signals.taskKindRewardRate["check-in"]).to.equal(0.3333);
    expect(signals.sourceSuccessRate.docs).to.equal(0.6667);
    expect(signals.rewardedRecords).to.equal(1);
  });

  it("uses outcomes as bounded ranking adjustments", () => {
    const good = deriveLearningSignals([createEvidenceRecord({ projectId: "p", taskId: "a", taskKind: "verify", outcome: "success", rewardOutcome: "rewarded", source: "official", id: "1", timestamp: "2026-09-11T10:00:00.000Z" })]);
    const bad = deriveLearningSignals([createEvidenceRecord({ projectId: "p", taskId: "a", taskKind: "verify", outcome: "failed", rewardOutcome: "not-rewarded", source: "official", id: "2", timestamp: "2026-09-11T10:00:00.000Z" })]);
    expect(learningAdjustment({ projectId: "p", taskKind: "verify", source: "official", signals: good })).to.be.greaterThan(0);
    expect(learningAdjustment({ projectId: "p", taskKind: "verify", source: "official", signals: bad })).to.be.lessThan(0);
  });
});
