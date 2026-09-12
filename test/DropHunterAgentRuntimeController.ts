import { expect } from "chai";
import { DropHunterAgentRuntimeController } from "../agents/drop-hunter/agent-runtime-controller.js";
import type { DropHunterAgentRunResult } from "../agents/drop-hunter/agent-task-runner.js";
import type { DropHunterAgentRuntimeStatus, DropHunterAgentRuntimeStatusStore } from "../agents/drop-hunter/agent-runtime-status.js";

class MemoryStatus implements DropHunterAgentRuntimeStatusStore {
  value?: DropHunterAgentRuntimeStatus;
  async read() { return this.value; }
  async write(value: DropHunterAgentRuntimeStatus) { this.value = structuredClone(value); }
}

const result: DropHunterAgentRunResult = { considered: 1, executed: 1, completed: 1, failed: 0, skipped: 0, records: [] };

describe("DropHunterAgentRuntimeController", () => {
  it("records a successful manual cycle", async () => {
    const status = new MemoryStatus();
    const times = [new Date("2026-09-12T08:00:00.000Z"), new Date("2026-09-12T08:00:01.000Z"), new Date("2026-09-12T08:00:01.000Z")];
    const controller = new DropHunterAgentRuntimeController({ runOnce: async () => result } as never, status, { intervalMs: 300_000, trustedCheckIns: 2, now: () => times.shift()! });
    expect(await controller.runOnce()).to.equal(result);
    expect(status.value).to.deep.include({ state: "idle", trustedCheckIns: 2, lastResult: result, nextRunAt: "2026-09-12T08:05:01.000Z" });
  });

  it("rejects overlapping cycles", async () => {
    let release!: () => void;
    const pending = new Promise<DropHunterAgentRunResult>((resolve) => { release = () => resolve(result); });
    const controller = new DropHunterAgentRuntimeController({ runOnce: () => pending } as never, new MemoryStatus(), { intervalMs: 60_000, trustedCheckIns: 0 });
    const first = controller.runOnce();
    await Promise.resolve();
    let error: unknown;
    try { await controller.runOnce(); } catch (value) { error = value; }
    expect(error).to.be.instanceOf(Error);
    expect((error as Error).message).to.contain("already running");
    release();
    await first;
  });
});
