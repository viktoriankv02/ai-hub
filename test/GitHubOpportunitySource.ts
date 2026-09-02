import { expect } from "chai";
import { GitHubRepositoryOpportunitySource } from "../agents/drop-hunter/github-opportunity-source.js";

describe("GitHubRepositoryOpportunitySource", () => {
  it("normalizes repository metadata without inventing reward evidence", async () => {
    const source = new GitHubRepositoryOpportunitySource({
      queries: ["incentivized testnet"],
      fetcher: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            items: [
              {
                full_name: "example/project",
                name: "project",
                html_url: "https://github.com/example/project",
                description: "Incentivized testnet with bridge, swap and quest campaign",
                topics: ["web3", "testnet"],
                language: "Solidity",
                updated_at: "2026-09-01T12:00:00Z",
              },
            ],
          };
        },
      }),
    });

    const [opportunity] = await source.discover();

    expect(opportunity).to.not.equal(undefined);
    expect(opportunity.id).to.equal("github:example/project");
    expect(opportunity.vm).to.equal("EVM");
    expect(opportunity.stage).to.equal("incentivized");
    expect(opportunity.actions).to.include.members(["bridge", "swap", "quest"]);
    expect(opportunity.sources).to.include("https://github.com/example/project");
    expect(opportunity.notes).to.include("no reward or eligibility claim inferred");
  });

  it("deduplicates repositories returned by multiple queries", async () => {
    let calls = 0;
    const source = new GitHubRepositoryOpportunitySource({
      queries: ["testnet", "incentivized testnet"],
      fetcher: async () => {
        calls += 1;
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              items: [{
                full_name: "example/project",
                name: "project",
                html_url: "https://github.com/example/project",
                description: "testnet bridge",
                topics: ["testnet"],
                updated_at: "2026-09-01T12:00:00Z",
              }],
            };
          },
        };
      },
    });

    const results = await source.discover();

    expect(calls).to.equal(2);
    expect(results).to.have.length(1);
  });

  it("rejects an invalid GitHub response", async () => {
    const source = new GitHubRepositoryOpportunitySource({
      queries: ["testnet"],
      fetcher: async () => ({
        ok: true,
        status: 200,
        async json() {
          return { invalid: true };
        },
      }),
    });

    await expect(source.discover()).to.be.rejectedWith("no items array");
  });

  it("propagates HTTP failures", async () => {
    const source = new GitHubRepositoryOpportunitySource({
      queries: ["testnet"],
      fetcher: async () => ({
        ok: false,
        status: 403,
        async json() {
          return {};
        },
      }),
    });

    await expect(source.discover()).to.be.rejectedWith("HTTP 403");
  });
});
