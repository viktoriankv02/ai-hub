import { expect } from "chai";
import {
  PRIORITY_OPPORTUNITIES,
  createReport,
  planOpportunity,
  planTopOpportunities,
  rankOpportunities,
  scoreOpportunity,
} from "../agents/drop-hunter/index.js";

describe("Drop Hunter", function () {
  it("ranks the first-wave builder targets deterministically", function () {
    const ranked = rankOpportunities(PRIORITY_OPPORTUNITIES);

    expect(ranked).to.have.length(6);
    expect(ranked[0].name).to.equal("Ink Sepolia");
    expect(ranked.every((item) => item.score >= 0 && item.score <= 100)).to.equal(true);
  });

  it("does not invent reward evidence", function () {
    const scored = scoreOpportunity(PRIORITY_OPPORTUNITIES[0]);

    expect(scored.score).to.be.lessThan(70);
    expect(scored.reasons).to.not.include("explicit reward/incentive signal");
    expect(scored.sources).to.include("config/chainCatalog.ts");
  });

  it("lets new evidence change the opportunity score", function () {
    const baseline = scoreOpportunity(PRIORITY_OPPORTUNITIES[0]);
    const enriched = scoreOpportunity({
      ...PRIORITY_OPPORTUNITIES[0],
      signals: {
        ...PRIORITY_OPPORTUNITIES[0].signals,
        fundingEvidence: 90,
        developerProgram: 95,
        rewardSignals: 90,
        ecosystemActivity: 85,
      },
      sources: [...PRIORITY_OPPORTUNITIES[0].sources, "research/evidence.json"],
    });

    expect(enriched.score).to.be.greaterThan(baseline.score);
    expect(enriched.confidence).to.be.greaterThan(baseline.confidence);
    expect(enriched.reasons).to.include("strong developer-program signal");
    expect(enriched.reasons).to.include("explicit reward/incentive signal");
  });

  it("creates a timestamped report", function () {
    const report = createReport(PRIORITY_OPPORTUNITIES);

    expect(report.generatedAt).to.be.a("string");
    expect(report.opportunities).to.have.length(6);
  });

  it("turns Ink into executable developer actions", function () {
    const ink = PRIORITY_OPPORTUNITIES.find((item) => item.id === "ink-sepolia")!;
    const plan = planOpportunity(ink);

    expect(plan.map((action) => action.id)).to.deep.equal([
      "deploy-erc20",
      "deploy-nft",
      "verify-contract",
      "record-activity",
    ]);
    expect(plan.every((action) => action.completed === false)).to.equal(true);
  });

  it("tracks completed actions from the user's execution profile", function () {
    const ink = PRIORITY_OPPORTUNITIES.find((item) => item.id === "ink-sepolia")!;
    const plan = planOpportunity(ink, {
      completedActionIds: ["deploy-erc20", "verify-contract"],
    });

    expect(plan.find((action) => action.id === "deploy-erc20")?.completed).to.equal(true);
    expect(plan.find((action) => action.id === "verify-contract")?.completed).to.equal(true);
    expect(plan.find((action) => action.id === "record-activity")?.completed).to.equal(false);
  });

  it("can restrict the agent to low-risk actions", function () {
    const opportunity = scoreOpportunity({
      id: "test",
      name: "Test",
      vm: "EVM",
      stage: "testnet",
      priority: 50,
      signals: {},
      sources: ["test"],
      actions: ["deploy ERC20", "verify contract", "record activity", "test reward flow"],
    });

    const plan = planOpportunity(opportunity, { preferredRisk: "low" });
    expect(plan.map((action) => action.id)).to.deep.equal([
      "verify-contract",
      "record-activity",
    ]);
  });

  it("plans every ranked opportunity without losing its score", function () {
    const ranked = rankOpportunities(PRIORITY_OPPORTUNITIES);
    const planned = planTopOpportunities(ranked);

    expect(planned).to.have.length(ranked.length);
    expect(planned[0].opportunity.score).to.equal(ranked[0].score);
    expect(planned[0].actions.length).to.be.greaterThan(0);
  });
});
