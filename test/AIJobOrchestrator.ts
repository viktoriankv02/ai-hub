import { expect } from "chai";
import { AIJobOrchestrator, InMemoryAIJobStore, planOpportunityJob, successfulExecution } from "../agents/ai-jobs/index.js";
import type { ScoredOpportunity } from "../agents/drop-hunter/types.js";

describe("AIJobOrchestrator", function () {
  const request = {
    idempotencyKey: "opportunity:ink:90",
    agentId: "1",
    taskHash: "task-hash",
    prompt: "Run the documented Ink actions",
    reward: "1000000",
    trigger: "opportunity" as const,
  };

  it("is idempotent when the same job is enqueued twice", function () {
    let counter = 0;
    const orchestrator = new AIJobOrchestrator(new InMemoryAIJobStore(), {
      idFactory: () => `job-${++counter}`,
    });

    const first = orchestrator.enqueue(request);
    const second = orchestrator.enqueue(request);

    expect(first.id).to.equal("job-1");
    expect(second.id).to.equal(first.id);
    expect(orchestrator.list()).to.have.length(1);
  });

  it("completes a job and preserves the result hash", async function () {
    const orchestrator = new AIJobOrchestrator();
    const job = orchestrator.enqueue(request);

    const result = await orchestrator.run(job.id, {
      async execute(current) {
        expect(current.status).to.equal("running");
        return successfulExecution("result-hash", "done");
      },
    });

    expect(result.reused).to.equal(false);
    expect(result.job.status).to.equal("completed");
    expect(result.job.attempts).to.equal(1);
    expect(result.job.resultHash).to.equal("result-hash");
  });

  it("retries transient failures and stops after the configured attempt limit", async function () {
    const orchestrator = new AIJobOrchestrator(new InMemoryAIJobStore(), { maxAttempts: 2 });
    const job = orchestrator.enqueue(request);
    let calls = 0;

    const first = await orchestrator.run(job.id, {
      async execute() {
        calls += 1;
        throw new Error("temporary failure");
      },
    });

    expect(first.job.status).to.equal("queued");
    expect(first.job.attempts).to.equal(1);
    expect(first.job.error).to.equal("temporary failure");

    const second = await orchestrator.run(job.id, {
      async execute() {
        calls += 1;
        throw new Error("permanent failure");
      },
    });

    expect(second.job.status).to.equal("failed");
    expect(second.job.attempts).to.equal(2);
    expect(calls).to.equal(2);
  });

  it("coalesces an overlapping execution request", async function () {
    const orchestrator = new AIJobOrchestrator();
    const job = orchestrator.enqueue(request);
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;

    const firstRun = orchestrator.run(job.id, {
      async execute() {
        calls += 1;
        await wait;
        return successfulExecution("result");
      },
    });

    await new Promise((resolve) => setImmediate(resolve));
    const secondRun = await orchestrator.run(job.id, {
      async execute() {
        calls += 1;
        return successfulExecution("wrong-result");
      },
    });

    expect(secondRun.reused).to.equal(true);
    expect(secondRun.job.status).to.equal("running");
    expect(calls).to.equal(1);

    release();
    const completed = await firstRun;
    expect(completed.job.status).to.equal("completed");
  });

  it("plans a high-value opportunity into an executable job", function () {
    const opportunity: ScoredOpportunity = {
      id: "ink",
      name: "Ink",
      chainId: 763373,
      vm: "EVM",
      stage: "builder-program",
      priority: 100,
      score: 90,
      confidence: 95,
      signals: {
        fundingEvidence: 90,
        developerProgram: 100,
        testnetActivity: 100,
        onchainVerifiability: 90,
        rewardSignals: 80,
      },
      sources: ["https://example.com"],
      actions: ["Deploy the sample contract", "Submit the transaction hash"],
      reasons: ["strong developer-program signal"],
    };

    const job = planOpportunityJob(opportunity, { agentId: "1", reward: "100" });

    expect(job).to.not.equal(undefined);
    expect(job?.opportunityId).to.equal("ink");
    expect(job?.trigger).to.equal("opportunity");
    expect(job?.prompt).to.contain("Deploy the sample contract");
  });

  it("does not create an executable job below the score threshold", function () {
    const opportunity: ScoredOpportunity = {
      id: "low",
      name: "Low",
      vm: "EVM",
      stage: "research",
      priority: 20,
      score: 20,
      confidence: 20,
      signals: {},
      sources: [],
      actions: [],
      reasons: [],
    };

    expect(planOpportunityJob(opportunity, { agentId: "1", reward: "100" })).to.equal(undefined);
  });
});
