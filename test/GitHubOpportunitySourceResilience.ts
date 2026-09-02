import { expect } from "chai";
import { GitHubRepositoryOpportunitySource } from "../agents/drop-hunter/github-opportunity-source.js";

type MockResponse = {
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
};

function response(status: number, payload: unknown, headers: Record<string, string> = {}): MockResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    async json() { return payload; },
  };
}

describe("GitHub Drop Hunter source resilience", function () {
  it("continues discovery when one query fails", async function () {
    let calls = 0;
    const source = new GitHubRepositoryOpportunitySource({
      queries: ["broken query", "working query"],
      fetcher: async (url) => {
        calls += 1;
        if (url.includes("broken%20query")) return response(503, {});
        return response(200, {
          items: [{
            full_name: "example/working",
            name: "working",
            html_url: "https://github.com/example/working",
            description: "testnet EVM bridge",
            topics: ["testnet"],
          }],
        });
      },
    });

    const opportunities = await source.discover();
    expect(calls).to.equal(2);
    expect(opportunities).to.have.length(1);
    expect(opportunities[0].id).to.equal("github:example/working");
  });

  it("reports Retry-After and rate-limit reset metadata for 403", async function () {
    const reset = Math.floor(Date.now() / 1000) + 300;
    const source = new GitHubRepositoryOpportunitySource({
      queries: ["rate limited"],
      fetcher: async () => response(403, {}, {
        "retry-after": "30",
        "x-ratelimit-reset": String(reset),
      }),
    });

    await expect(source.discover())
      .to.be.rejectedWith(/rate limited.*Retry-After=30s.*rate-limit-reset=/);
  });

  it("fails clearly when every query fails", async function () {
    const source = new GitHubRepositoryOpportunitySource({
      queries: ["one", "two"],
      fetcher: async () => response(429, {}, { "retry-after": "60" }),
    });

    await expect(source.discover())
      .to.be.rejectedWith(/All GitHub discovery queries failed/)
      .and.to.be.rejectedWith(/Retry-After=60s/);
  });
});
