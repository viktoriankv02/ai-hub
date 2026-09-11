import { expect } from "chai";
import { aggregateSourceTrust, assessOpportunitySource } from "../agents/drop-hunter/source-trust.js";

describe("Drop Hunter source trust", () => {
  it("scores official documentation above community sources", () => {
    const official = assessOpportunitySource("https://docs.example.test/testnet");
    const community = assessOpportunitySource("https://x.com/example/status/1");
    expect(official.sourceClass).to.equal("official");
    expect(official.trust).to.be.greaterThan(community.trust);
  });

  it("increases trust when multiple sources corroborate the project", () => {
    const one = aggregateSourceTrust(["https://github.com/example/project"]);
    const many = aggregateSourceTrust([
      "https://github.com/example/project",
      "https://docs.example.test",
      "https://galxe.com/example",
    ]);
    expect(many.trust).to.be.greaterThan(one.trust);
  });
});
