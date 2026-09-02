import { expect } from "chai";
import { ChainExecutionRegistry, selectChainTarget, type AIJobChainExecutionAdapter } from "../agents/ai-jobs/chain-execution.js";
import type { AIJobRecord } from "../agents/ai-jobs/types.js";

function target(id: string, enabled = true) {
  return {
    id,
    name: id,
    family: "evm" as const,
    chainId: id === "base" ? 84532 : 763373,
    enabled,
  };
}

function adapter(id: string, enabled = true): AIJobChainExecutionAdapter {
  const chain = target(id, enabled);
  return {
    target: chain,
    canExecute: () => true,
    provision: async (job: AIJobRecord) => ({
      target: chain,
      jobId: job.id,
      status: "provisioned",
      reused: false,
    }),
    complete: async (job: AIJobRecord) => ({
      target: chain,
      jobId: job.id,
      status: "completed",
      reused: false,
    }),
    execute: async (job: AIJobRecord) => ({
      target: chain,
      jobId: job.id,
      status: "completed",
      reused: false,
    }),
  };
}

describe("ChainExecutionRegistry", function () {
  it("registers and resolves independent chain targets", function () {
    const registry = new ChainExecutionRegistry();
    registry.register(adapter("base"));
    registry.register(adapter("ink"));

    expect(registry.list().map((item) => item.id)).to.deep.equal(["base", "ink"]);
    expect(registry.require("base").target.chainId).to.equal(84532);
    expect(registry.require("ink").target.chainId).to.equal(763373);
  });

  it("rejects duplicate target ids", function () {
    const registry = new ChainExecutionRegistry();
    registry.register(adapter("base"));
    expect(() => registry.register(adapter("base"))).to.throw("already registered");
  });

  it("does not select a disabled target", function () {
    const registry = new ChainExecutionRegistry();
    registry.register(adapter("base", false));
    expect(() => registry.require("base")).to.throw("disabled");
  });

  it("selects the first enabled target when no preference is supplied", function () {
    const registry = new ChainExecutionRegistry();
    registry.register(adapter("base", false));
    registry.register(adapter("ink"));

    expect(selectChainTarget(registry, undefined).target.id).to.equal("ink");
  });
});
