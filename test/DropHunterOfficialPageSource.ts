import { expect } from "chai";
import { OfficialPageOpportunitySource, parseOfficialPagesJson } from "../agents/drop-hunter/official-page-opportunity-source.js";

describe("OfficialPageOpportunitySource", () => {
  it("extracts stage, actions and signals from configured project pages", async () => {
    const source = new OfficialPageOpportunitySource({
      pages: [{ id: "project-x", name: "Project X", url: "https://docs.example.test/testnet", chainId: 84532, vm: "EVM" }],
      fetcher: async () => ({
        ok: true,
        status: 200,
        async text() {
          return `<html><body><h1>Testnet now live</h1><p>Use the faucet, bridge assets, swap, deploy a contract and verify contract. Points program is active.</p></body></html>`;
        },
      }),
    });
    const [result] = await source.discover();
    expect(result.stage).to.equal("incentivized");
    expect(result.actions).to.include.members(["faucet", "bridge", "swap", "deploy contract", "verify contract"]);
    expect(result.signals.rewardSignals).to.equal(80);
    expect(result.sources).to.deep.equal(["https://docs.example.test/testnet"]);
  });

  it("parses the environment JSON configuration", () => {
    const pages = parseOfficialPagesJson('[{"id":"p","name":"P","url":"https://docs.example.test"}]');
    expect(pages).to.have.length(1);
    expect(pages[0].id).to.equal("p");
  });
});
