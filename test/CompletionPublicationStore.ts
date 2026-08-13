import { expect } from "chai";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonCompletionPublicationStore, MemoryCompletionPublicationStore } from "../agents/ai-jobs/completion-store.js";

function attestation(jobId: string) {
  return {
    version: "AI_HUB_JOB_COMPLETION_V1" as const,
    jobId,
    agentId: "1",
    taskHash: "task",
    resultHash: "result",
    completedAt: "2026-08-13T10:00:00.000Z",
    signer: "0x0000000000000000000000000000000000000001",
    signature: `0x${"11".repeat(65)}`,
  };
}

describe("CompletionPublicationStore", function () {
  it("stores and retrieves a publication", function () {
    const store = new MemoryCompletionPublicationStore();
    const record = { jobId: "job-1", transactionId: "tx-1", publishedAt: "2026-08-13T10:00:00.000Z", attestation: attestation("job-1") };
    store.set(record);
    expect(store.get("job-1")).to.deep.equal(record);
  });

  it("restores JSON state after recreation", function () {
    const directory = mkdtempSync(join(tmpdir(), "ai-hub-completion-"));
    const file = join(directory, "state.json");
    try {
      const first = new JsonCompletionPublicationStore(file);
      first.set({ jobId: "job-2", transactionId: "tx-2", publishedAt: "2026-08-13T10:01:00.000Z", attestation: attestation("job-2") });
      const second = new JsonCompletionPublicationStore(file);
      expect(second.get("job-2")?.transactionId).to.equal("tx-2");
      expect(second.get("job-2")?.attestation.jobId).to.equal("job-2");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a conflicting transaction id", function () {
    const store = new MemoryCompletionPublicationStore();
    store.set({ jobId: "job-3", transactionId: "tx-a", publishedAt: "now", attestation: attestation("job-3") });
    expect(() => store.set({ jobId: "job-3", transactionId: "tx-b", publishedAt: "later", attestation: attestation("job-3") })).to.throw("already published");
  });

  it("rejects a publication whose attestation belongs to another job", function () {
    const store = new MemoryCompletionPublicationStore();
    expect(() => store.set({ jobId: "job-a", transactionId: "tx-a", publishedAt: "now", attestation: attestation("job-b") })).to.throw("match jobId");
  });
});
