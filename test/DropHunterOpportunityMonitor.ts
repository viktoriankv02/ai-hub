import { expect } from "chai";
import {
  OpportunityMonitor,
  mergeOpportunityConfidence,
} from "../agents/drop-hunter/index.js";

describe("Drop Hunter opportunity monitor", function () {
  const base = {
    opportunityId: "ink-builder",
    name: "Ink Builder Opportunity",
    score: 82,
    observedAt: "2026-08-09T10:00:00.000Z",
    lifecycle: "active" as const,
    confidence: "high" as const,
    rewardEvidence: "unconfirmed" as const,
    sourceCount: 3,
    recommendedActionIds: ["deploy-contract", "interact-ecosystem"],
    chainKeys: ["inkSepolia", "ink"],
  };

  it("stores observations and reports score changes", function () {
    const monitor = new OpportunityMonitor();

    const first = monitor.observe(base);
    const second = monitor.observe({
      ...base,
      score: 91,
      observedAt: "2026-08-10T10:00:00.000Z",
    });

    expect(first.isNew).to.equal(true);
    expect(first.becameActionable).to.equal(true);
    expect(second.isNew).to.equal(false);
    expect(second.scoreChanged).to.equal(true);
    expect(second.snapshot.observationCount).to.equal(2);
    expect(second.snapshot.scoreDelta).to.equal(9);
  });

  it("keeps reward evidence unconfirmed instead of inventing a reward", function () {
    const monitor = new OpportunityMonitor();
    monitor.observe(base);

    const snapshot = monitor.snapshot("ink-builder");
    expect(snapshot.rewardEvidence).to.equal("unconfirmed");
  });

  it("ranks actionable opportunities by score", function () {
    const monitor = new OpportunityMonitor({ minActionScore: 60 });

    monitor.observe(base);
    monitor.observe({
      ...base,
      opportunityId: "small-opportunity",
      name: "Small Opportunity",
      score: 58,
      recommendedActionIds: [],
      observedAt: "2026-08-09T11:00:00.000Z",
    });

    expect(monitor.actionable().map((item) => item.opportunityId)).to.deep.equal(["ink-builder"]);
  });

  it("marks active opportunities stale after the configured window", function () {
    const monitor = new OpportunityMonitor({ staleAfterMs: 60 * 60 * 1000 });
    monitor.observe(base);

    const changed = monitor.refreshStale("2026-08-09T12:01:00.000Z");

    expect(changed).to.have.length(1);
    expect(changed[0].lifecycle).to.equal("stale");
    expect(monitor.actionable()).to.deep.equal([]);
  });

  it("does not mutate observation history returned to callers", function () {
    const monitor = new OpportunityMonitor();
    monitor.observe(base);

    const history = monitor.historyFor("ink-builder");
    history[0].recommendedActionIds.push("mutated-outside");

    expect(monitor.historyFor("ink-builder")[0].recommendedActionIds).to.deep.equal([
      "deploy-contract",
      "interact-ecosystem",
    ]);
  });

  it("supports deterministic confidence merging", function () {
    expect(mergeOpportunityConfidence("low", "high")).to.equal("high");
    expect(mergeOpportunityConfidence("high", "medium")).to.equal("high");
  });
});
