import { expect } from "chai";
import { canonicalOpportunityKey, normalizeProjectName, sameOpportunity } from "../agents/drop-hunter/opportunity-identity.js";

const base = {
  id: "one",
  name: "Example Network Testnet",
  chainId: 12345,
  vm: "EVM" as const,
  stage: "testnet" as const,
  priority: 50,
  signals: {},
  sources: ["one"],
  actions: ["verify"],
};

describe("Drop Hunter opportunity identity", () => {
  it("normalizes generic network suffixes", () => {
    expect(normalizeProjectName("Example Network Testnet")).to.equal("example");
  });

  it("matches independently sourced records for the same chain and project", () => {
    const other = { ...base, id: "two", name: "Example Chain" };
    expect(canonicalOpportunityKey(other)).to.equal(canonicalOpportunityKey(base));
    expect(sameOpportunity(base, other)).to.equal(true);
  });

  it("does not merge records on different chain ids", () => {
    expect(sameOpportunity(base, { ...base, id: "two", chainId: 999 })).to.equal(false);
  });
});
