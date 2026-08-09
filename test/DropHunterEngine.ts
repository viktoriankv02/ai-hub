import { expect } from "chai";
import { DropHunterEngine } from "../agents/drop-hunter/engine.js";
import type { ProjectOpportunity } from "../agents/drop-hunter/types.js";

const opportunity: ProjectOpportunity = {
  id: "ink-builder",
  name: "Ink Builder Program",
  chainId: 763373,
  vm: "EVM",
  stage: "testnet",
  priority: 100,
  signals: {
    developerProgram: 90,
    testnetActivity: 90,
    onchainVerifiability: 90,
    ecosystemActivity: 70,
    timing: 90,
    rewardSignals: 20,
  },
  sources: ["official-ink", "ink-explorer"],
  actions: ["deploy ERC20", "verify contract", "record activity"],
};

describe("Drop Hunter integrated engine", function () {
  it("runs observation -> planning -> execution -> evidence -> re-evaluation", function () {
    const engine = new DropHunterEngine();

    const first = engine.observe(opportunity, {
      observedAt: "2026-08-09T12:00:00.000Z",
      confidence: "high",
    });

    expect(first.monitor.isNew).to.equal(true);
    expect(first.actions.map((action) => action.id)).to.deep.equal([
      "deploy-erc20",
      "verify-contract",
      "record-activity",
    ]);
    expect(first.evidenceSummaries.every((summary) => !summary.verified)).to.equal(true);

    engine.recordExecution({
      actionId: "deploy-erc20",
      status: "success",
      timestamp: "2026-08-09T12:05:00.000Z",
      risk: "medium",
      chainId: 763373,
      txHash: "0xdeploy",
    });
    engine.recordEvidence({
      actionId: "deploy-erc20",
      kind: "deployment",
      status: "success",
      confidence: "high",
      timestamp: "2026-08-09T12:05:01.000Z",
      chainId: 763373,
      txHash: "0xdeploy",
      contractAddress: "0x0000000000000000000000000000000000000001",
    });

    const second = engine.observe(opportunity, {
      observedAt: "2026-08-09T12:10:00.000Z",
      confidence: "high",
    });

    expect(second.monitor.isNew).to.equal(false);
    expect(second.executionProfile.successfulActionIds).to.deep.equal(["deploy-erc20"]);
    expect(second.actions.find((action) => action.id === "deploy-erc20")?.completed).to.equal(true);
    expect(second.evidenceSummaries.find((summary) => summary.actionId === "deploy-erc20")?.verified).to.equal(true);
    expect(second.verifiedEvidence.map((item) => item.txHash)).to.deep.equal(["0xdeploy"]);
  });

  it("does not turn failed execution into completion or proof", function () {
    const engine = new DropHunterEngine();

    engine.recordExecution({
      actionId: "deploy-erc20",
      status: "failed",
      timestamp: "2026-08-09T12:00:00.000Z",
      risk: "medium",
      chainId: 763373,
    });
    engine.recordEvidence({
      actionId: "deploy-erc20",
      kind: "deployment",
      status: "failed",
      confidence: "high",
      timestamp: "2026-08-09T12:00:01.000Z",
      chainId: 763373,
    });

    const result = engine.observe(opportunity, {
      observedAt: "2026-08-09T12:01:00.000Z",
    });

    expect(result.actions.find((action) => action.id === "deploy-erc20")?.completed).to.equal(false);
    expect(result.executionProfile.successfulActionIds).to.deep.equal([]);
    expect(result.executionProfile.failedActionIds).to.deep.equal(["deploy-erc20"]);
    expect(result.verifiedEvidence).to.deep.equal([]);
    expect(result.evidenceSummaries.find((summary) => summary.actionId === "deploy-erc20")?.verified).to.equal(false);
  });

  it("marks an opportunity stale when observations stop arriving", function () {
    const engine = new DropHunterEngine();

    engine.observe(opportunity, {
      observedAt: "2026-08-01T00:00:00.000Z",
    });

    const changed = engine.refreshStale("2026-08-09T00:00:01.000Z");

    expect(changed).to.have.length(1);
    expect(changed[0].lifecycle).to.equal("stale");
    expect(engine.actionable()).to.deep.equal([]);
  });
});
