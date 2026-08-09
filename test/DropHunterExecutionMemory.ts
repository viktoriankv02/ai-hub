import { expect } from "chai";
import {
  latestExecution,
  learnExecutionProfile,
  recordExecution,
} from "../agents/drop-hunter/index.js";

describe("Drop Hunter execution memory", function () {
  const baseEvent = {
    actionId: "deploy-erc20",
    risk: "medium" as const,
    timestamp: "2026-08-09T00:00:00.000Z",
    chainId: 763373,
  };

  it("learns only successful actions as completed", function () {
    const profile = learnExecutionProfile([
      { ...baseEvent, status: "success", txHash: "0xabc" },
      { ...baseEvent, actionId: "deploy-nft", status: "failed", note: "reverted" },
      { ...baseEvent, actionId: "verify-contract", status: "skipped" },
    ]);

    expect(profile.completedActionIds).to.deep.equal(["deploy-erc20"]);
    expect(profile.successfulActionIds).to.deep.equal(["deploy-erc20"]);
    expect(profile.failedActionIds).to.deep.equal(["deploy-nft"]);
    expect(profile.skippedActionIds).to.deep.equal(["verify-contract"]);
    expect(profile.successRate).to.equal(1 / 3);
    expect(profile.observations).to.equal(3);
  });

  it("records an execution event immutably", function () {
    const history = [
      { ...baseEvent, status: "success" as const },
    ];
    const next = recordExecution(history, {
      ...baseEvent,
      actionId: "record-activity",
      status: "success",
    });

    expect(history).to.have.length(1);
    expect(next).to.have.length(2);
    expect(next[1].actionId).to.equal("record-activity");
  });

  it("returns the most recent outcome for an action", function () {
    const history = [
      { ...baseEvent, status: "failed" as const, note: "first attempt" },
      { ...baseEvent, status: "success" as const, txHash: "0xdef" },
    ];

    expect(latestExecution(history, "deploy-erc20")?.status).to.equal("success");
    expect(latestExecution(history, "deploy-erc20")?.txHash).to.equal("0xdef");
    expect(latestExecution(history, "missing")).to.equal(undefined);
  });
});
