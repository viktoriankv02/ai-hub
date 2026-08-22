import { expect } from "chai";
import { AIJobMultiChainService } from "../agents/ai-jobs/multi-chain-service.js";
import type { AIJobMultiChainExecutor } from "../agents/ai-jobs/multi-chain-runtime.js";
import type { AIJobRecord } from "../agents/ai-jobs/types.js";

function completedJob(): AIJobRecord {
  return {
    id: "job_1",
    idempotencyKey: "idem_1",
    agentId: "agent_1",
    taskHash: "task_hash",
    prompt: "execute",
    reward: "1",
    trigger: "manual",
    chainTargetId: "ink-sepolia",
    status: "completed",
    attempts: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:01:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    resultHash: "result_hash",
  };
}

describe("AIJobMultiChainService", function () {
  it("uses the job chain target when no explicit target is supplied", async function () {
    const calls: string[] = [];
    const executor = {
      targets: () => [{ id: "base-sepolia", name: "Base", family: "evm" as const, chainId: 84532, enabled: true }],
      provision: async (_job: AIJobRecord, target?: string) => {
        calls.push(`provision:${target}`);
        return { target: { id: target ?? "", name: "", family: "evm" as const, chainId: 1, enabled: true }, jobId: "job_1", status: "provisioned" as const, reused: false };
      },
      complete: async (_job: AIJobRecord, target?: string) => {
        calls.push(`complete:${target}`);
        return { target: { id: target ?? "", name: "", family: "evm" as const, chainId: 1, enabled: true }, jobId: "job_1", status: "completed" as const, reused: false };
      },
      execute: async (_job: AIJobRecord, target?: string) => {
        calls.push(`execute:${target}`);
        return { target: { id: target ?? "", name: "", family: "evm" as const, chainId: 1, enabled: true }, jobId: "job_1", status: "settled" as const, reused: false };
      },
    } as unknown as AIJobMultiChainExecutor;

    const service = new AIJobMultiChainService(executor);
    await service.execute(completedJob());
    expect(calls).to.deep.equal(["execute:ink-sepolia"]);
  });

  it("prefers an explicit target over the job target", async function () {
    let selected = "";
    const executor = {
      targets: () => [],
      provision: async () => { throw new Error("unused"); },
      complete: async () => { throw new Error("unused"); },
      execute: async (_job: AIJobRecord, target?: string) => {
        selected = target ?? "";
        return { target: { id: selected, name: selected, family: "evm" as const, chainId: 1, enabled: true }, jobId: "job_1", status: "settled" as const, reused: false };
      },
    } as unknown as AIJobMultiChainExecutor;

    const service = new AIJobMultiChainService(executor);
    await service.execute(completedJob(), "base-sepolia");
    expect(selected).to.equal("base-sepolia");
  });

  it("rejects non-completed jobs before touching a chain adapter", async function () {
    let called = false;
    const executor = {
      targets: () => [],
      provision: async () => { called = true; throw new Error("unexpected"); },
      complete: async () => { called = true; throw new Error("unexpected"); },
      execute: async () => { called = true; throw new Error("unexpected"); },
    } as unknown as AIJobMultiChainExecutor;

    const service = new AIJobMultiChainService(executor);
    const job = { ...completedJob(), status: "queued" as const };
    await expect(service.execute(job)).to.be.rejectedWith("only completed jobs can execute on-chain");
    expect(called).to.equal(false);
  });
});
