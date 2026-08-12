import { expect } from "chai";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AIJobOrchestrator,
  AIJobRunner,
  JsonFileAIJobStore,
  successfulExecution,
} from "../agents/ai-jobs/index.js";

describe("AIJobRunner", function () {
  it("persists jobs and restores them from disk", function () {
    const directory = mkdtempSync(join(tmpdir(), "ai-hub-jobs-"));
    const file = join(directory, "jobs.json");

    try {
      const firstStore = new JsonFileAIJobStore(file);
      const first = new AIJobOrchestrator(firstStore, { idFactory: () => "persistent-job" });
      first.enqueue({
        idempotencyKey: "persistent-key",
        agentId: "1",
        taskHash: "task",
        prompt: "persist me",
        reward: "10",
      });

      const secondStore = new JsonFileAIJobStore(file);
      const second = new AIJobOrchestrator(secondStore);
      const restored = second.list();

      expect(restored).to.have.length(1);
      expect(restored[0].id).to.equal("persistent-job");
      expect(second.enqueue({
        idempotencyKey: "persistent-key",
        agentId: "1",
        taskHash: "task",
        prompt: "persist me",
        reward: "10",
      }).id).to.equal("persistent-job");

      const raw = readFileSync(file, "utf8");
      expect(raw).to.contain('"version": 1');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("drains only the configured batch size", async function () {
    const orchestrator = new AIJobOrchestrator();
    for (let i = 0; i < 3; i += 1) {
      orchestrator.enqueue({
        idempotencyKey: `key-${i}`,
        agentId: "1",
        taskHash: `task-${i}`,
        prompt: `job-${i}`,
        reward: "10",
      });
    }

    let calls = 0;
    const runner = new AIJobRunner(
      orchestrator,
      {
        async execute() {
          calls += 1;
          return successfulExecution(`result-${calls}`);
        },
      },
      { batchSize: 2 },
    );

    const first = await runner.drain();
    expect(first.processed).to.have.length(2);
    expect(calls).to.equal(2);
    expect(orchestrator.list().filter((job) => job.status === "queued")).to.have.length(1);

    const second = await runner.drain();
    expect(second.processed).to.have.length(1);
    expect(calls).to.equal(3);
    expect(orchestrator.list().filter((job) => job.status === "completed")).to.have.length(3);
  });
});
