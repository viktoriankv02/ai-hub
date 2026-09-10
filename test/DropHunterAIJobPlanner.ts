import { expect } from "chai";
import {
  DropHunterAgent,
  StaticOpportunitySource,
} from "../agents/drop-hunter/index.js";
import { planDropTaskJobs } from "../agents/ai-jobs/index.js";
import type { ProjectOpportunity } from "../agents/drop-hunter/index.js";

describe("Drop Hunter -> AI Job Planner", function () {
  const opportunity: ProjectOpportunity = {
    id: "integration-opportunity",
    name: "Integration Test Network",
    chainId: 763373,
    vm: "EVM",
    stage: "testnet",
    priority: 90,
    signals: {
      developerProgram: 90,
      testnetActivity: 90,
      onchainVerifiability: 95,
      ecosystemActivity: 80,
      rewardSignals: 70,
      userFit: 90,
      timing: 80,
    },
    sources: ["integration-test"],
    actions: [
      "Join the community Discord",
      "Bridge testnet ETH to the network",
      "Swap testnet tokens",
      "Mint the test NFT",
    ],
    notes: "Test fixture only; reward and eligibility must be independently verified.",
  };

  it("extracts tasks and plans only non-approval jobs by default", async function () {
    const hunter = new DropHunterAgent([
      new StaticOpportunitySource("integration", "Integration fixture", [opportunity]),
    ]);

    const report = await hunter.scan("2026-09-02T12:00:00.000Z");
    expect(report.opportunities).to.have.length(1);
    expect(report.results[0].tasks.length).to.be.greaterThan(0);

    const jobs = planDropTaskJobs(report.results, {
      agentId: "drop-hunter",
      reward: "0",
    });

    expect(jobs.length).to.be.greaterThan(0);
    expect(jobs.every((job) => job.trigger === "opportunity")).to.equal(true);
    expect(jobs.every((job) => job.opportunityId === opportunity.id)).to.equal(true);
    expect(jobs.every((job) => !job.prompt.includes("guaranteed reward"))).to.equal(true);
    expect(jobs.every((job) => !job.prompt.includes("eligible for rewards"))).to.equal(true);
    expect(jobs.every((job) => job.prompt.includes("Do not invent reward evidence"))).to.equal(true);

    const approvalJobs = jobs.filter((job) => job.metadata?.requiresUserApproval === "true");
    expect(approvalJobs).to.have.length(0);
  });

  it("includes approval-required tasks only when explicitly enabled", async function () {
    const hunter = new DropHunterAgent([
      new StaticOpportunitySource("integration", "Integration fixture", [opportunity]),
    ]);
    const report = await hunter.scan("2026-09-02T12:00:00.000Z");

    const jobs = planDropTaskJobs(report.results, {
      agentId: "drop-hunter",
      reward: "0",
      includeApprovalRequired: true,
    });

    expect(jobs.some((job) => job.metadata?.requiresUserApproval === "true")).to.equal(true);
  });

  it("keeps task job idempotency stable for the same analysis", async function () {
    const hunter = new DropHunterAgent([
      new StaticOpportunitySource("integration", "Integration fixture", [opportunity]),
    ]);
    const report = await hunter.scan("2026-09-02T12:00:00.000Z");

    const options = {
      agentId: "drop-hunter",
      reward: "0",
    };
    const first = planDropTaskJobs(report.results, options).map((job) => job.idempotencyKey);
    const second = planDropTaskJobs(report.results, options).map((job) => job.idempotencyKey);

    expect(first).to.deep.equal(second);
    expect(new Set(first).size).to.equal(first.length);
  });
});
