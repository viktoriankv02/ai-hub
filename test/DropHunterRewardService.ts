import { expect } from "chai";
import {
  DropHunterRewardService,
  MemoryDropHunterRewardStore,
  createRewardRecord,
  rewardFingerprint,
} from "../agents/drop-hunter/index.js";

describe("DropHunterRewardService", () => {
  it("creates deterministic reward identities", () => {
    const input = {
      projectId: "project-x",
      taskId: "claim",
      chainId: 84532,
      status: "detected" as const,
      source: "campaign" as const,
      assetSymbol: "DROP",
      amount: "100",
      reference: "campaign-1",
    };
    expect(rewardFingerprint(input)).to.equal(rewardFingerprint({ ...input }));
    expect(createRewardRecord(input).id).to.equal(rewardFingerprint(input));
  });

  it("upserts rewards and summarizes value", async () => {
    const service = new DropHunterRewardService(new MemoryDropHunterRewardStore(), () => new Date("2026-09-11T20:00:00.000Z"));
    const first = await service.detect({
      projectId: "project-x",
      status: "claimable",
      source: "campaign",
      assetSymbol: "DROP",
      amount: "100",
      estimatedUsd: 25.5,
      confidence: 0.9,
      reference: "campaign-1",
    });
    await service.detect({
      projectId: "project-y",
      status: "confirmed",
      source: "onchain",
      assetSymbol: "USDC",
      amount: "10",
      estimatedUsd: 10,
      confidence: 1,
      reference: "tx-1",
    });

    const summary = await service.summary();
    expect(summary.total).to.equal(2);
    expect(summary.claimable).to.equal(1);
    expect(summary.confirmed).to.equal(1);
    expect(summary.estimatedUsd).to.equal(35.5);
    expect(summary.confirmedUsd).to.equal(10);
    expect((await service.get(first.id))?.assetSymbol).to.equal("DROP");
  });

  it("enforces reward lifecycle transitions", async () => {
    const service = new DropHunterRewardService(new MemoryDropHunterRewardStore());
    const reward = await service.detect({
      projectId: "project-x",
      status: "detected",
      source: "unknown",
      confidence: 0.5,
    });
    await service.setStatus(reward.id, "claimable");
    await service.setStatus(reward.id, "claimed");
    const confirmed = await service.setStatus(reward.id, "confirmed");
    expect(confirmed.status).to.equal("confirmed");
    await expect(service.setStatus(reward.id, "claimable")).to.be.rejectedWith("invalid reward status transition");
  });

  it("filters rewards by project and status", async () => {
    const service = new DropHunterRewardService(new MemoryDropHunterRewardStore());
    await service.detect({ projectId: "a", status: "detected", source: "manual", confidence: 0.5, reference: "1" });
    await service.detect({ projectId: "a", status: "claimable", source: "manual", confidence: 0.5, reference: "2" });
    await service.detect({ projectId: "b", status: "claimable", source: "manual", confidence: 0.5, reference: "3" });
    expect(await service.list({ projectId: "a" })).to.have.length(2);
    expect(await service.list({ status: "claimable" })).to.have.length(2);
  });
});
