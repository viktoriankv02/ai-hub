import { expect } from "chai";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileDropHunterAgentRuntimeStatusStore, isDropHunterAgentStatusStale } from "../agents/drop-hunter/agent-runtime-status.js";

describe("DropHunterAgentRuntimeStatusStore", () => {
  it("persists a runtime heartbeat atomically", async () => {
    const directory = await mkdtemp(join(tmpdir(), "drop-hunter-agent-"));
    try {
      const store = new JsonFileDropHunterAgentRuntimeStatusStore(join(directory, "status.json"));
      expect(await store.read()).to.equal(undefined);
      await store.write({ version: 1, state: "idle", updatedAt: "2026-09-12T06:10:00.000Z", intervalMs: 300_000, trustedCheckIns: 2 });
      expect(await store.read()).to.deep.include({ state: "idle", intervalMs: 300_000, trustedCheckIns: 2 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("detects stale workers using the configured interval", () => {
    const status = { version: 1 as const, state: "idle" as const, updatedAt: "2026-09-12T06:00:00.000Z", intervalMs: 300_000, trustedCheckIns: 0 };
    expect(isDropHunterAgentStatusStale(status, new Date("2026-09-12T06:09:59.000Z"))).to.equal(false);
    expect(isDropHunterAgentStatusStale(status, new Date("2026-09-12T06:10:01.000Z"))).to.equal(true);
  });
});
