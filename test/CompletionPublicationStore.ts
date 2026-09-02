import { expect } from "chai";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonCompletionPublicationStore, MemoryCompletionPublicationStore } from "../agents/ai-jobs/completion-store.js";

describe("CompletionPublicationStore", function () {
  it("stores and retrieves a publication", function () {
    const store = new MemoryCompletionPublicationStore();
    const record = { jobId: "job-1", transactionId: "tx-1", publishedAt: "2026-08-13T10:00:00.000Z" };
    store.set(record);
    expect(store.get("job-1")).to.deep.equal(record);
  });

  it("restores JSON state after recreation", function () {
    const directory = mkdtempSync(join(tmpdir(), "ai-hub-completion-"));
    const file = join(directory, "state.json");
    try {
      const first = new JsonCompletionPublicationStore(file);
      first.set({ jobId: "job-2", transactionId: "tx-2", publishedAt: "2026-08-13T10:01:00.000Z" });
      const second = new JsonCompletionPublicationStore(file);
      expect(second.get("job-2")?.transactionId).to.equal("tx-2");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a conflicting transaction id", function () {
    const store = new MemoryCompletionPublicationStore();
    store.set({ jobId: "job-3", transactionId: "tx-a", publishedAt: "now" });
    expect(() => store.set({ jobId: "job-3", transactionId: "tx-b", publishedAt: "later" })).to.throw("already published");
  });
});
