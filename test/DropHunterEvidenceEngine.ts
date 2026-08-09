import { expect } from "chai";
import {
  recordEvidence,
  summarizeEvidence,
  verifiedEvidence,
} from "../agents/drop-hunter/index.js";

describe("Drop Hunter evidence engine", function () {
  const timestamp = "2026-08-09T00:00:00.000Z";

  it("distinguishes successful on-chain proof from execution alone", function () {
    const summary = summarizeEvidence("deploy-erc20", [
      {
        actionId: "deploy-erc20",
        kind: "github",
        status: "success",
        confidence: "high",
        timestamp,
      },
      {
        actionId: "deploy-erc20",
        kind: "onchain",
        status: "success",
        confidence: "high",
        timestamp,
        chainId: 763373,
        txHash: "0xabc",
      },
    ]);

    expect(summary.verified).to.equal(true);
    expect(summary.confidence).to.equal("high");
    expect(summary.evidenceCount).to.equal(2);
    expect(summary.kinds).to.deep.equal(["github", "onchain"]);
    expect(summary.txHashes).to.deep.equal(["0xabc"]);
  });

  it("does not treat failed or skipped evidence as proof", function () {
    const evidence = [
      {
        actionId: "deploy-nft",
        kind: "deployment" as const,
        status: "failed" as const,
        confidence: "high" as const,
        timestamp,
        txHash: "0xfailed",
      },
      {
        actionId: "verify-contract",
        kind: "verification" as const,
        status: "skipped" as const,
        confidence: "medium" as const,
        timestamp,
      },
    ];

    expect(verifiedEvidence(evidence)).to.deep.equal([]);
    expect(summarizeEvidence("deploy-nft", evidence).verified).to.equal(false);
  });

  it("records evidence without mutating the original history", function () {
    const history = [];
    const next = recordEvidence(history, {
      actionId: "record-activity",
      kind: "onchain",
      status: "success",
      confidence: "high",
      timestamp,
      chainId: 763373,
      txHash: "0xdef",
    });

    expect(history).to.have.length(0);
    expect(next).to.have.length(1);
    expect(next[0].txHash).to.equal("0xdef");
  });
});
