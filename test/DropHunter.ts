import { expect } from "chai";
import {
  PRIORITY_OPPORTUNITIES,
  createReport,
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
});
