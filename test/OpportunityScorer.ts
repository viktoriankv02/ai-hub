import { expect } from "chai";
import { rankOpportunities, scoreOpportunity } from "../agents/OpportunityScorer.js";

describe("OpportunityScorer", function () {
  it("prioritizes live funded builder programs with AI/agent alignment", function () {
    const result = scoreOpportunity({
      name: "Ink",
      chainId: 763373,
      signals: {
        liveBuilderProgram: true,
        fundedTeam: true,
        recentLaunch: true,
        testnetLive: true,
        aiAgentAlignment: true,
        defiAlignment: true,
        developerProgram: true,
        measurableOnchainActivity: true,
        lowExecutionCost: true,
        timeSensitive: true,
      },
    });

    expect(result.score).to.equal(100);
    expect(result.priority).to.equal("critical");
  });

  it("ranks opportunities by transparent score", function () {
    const results = rankOpportunities([
      { name: "Low", signals: { testnetLive: true } },
      {
        name: "High",
        signals: {
          liveBuilderProgram: true,
          developerProgram: true,
          aiAgentAlignment: true,
          measurableOnchainActivity: true,
        },
      },
    ]);

    expect(results.map((item) => item.name)).to.deep.equal(["High", "Low"]);
    expect(results[0].reasons.length).to.be.greaterThan(0);
  });
});
