import { expect } from "chai";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ExecutionPlanNode, MultiChainExecutionPlan } from "../agents/multi-chain/execution-planner.js";
import { ExecutionPlanRunner, type ExecutionPlanNodeExecutor } from "../agents/multi-chain/execution-plan-runner.js";
import {
  JsonFileExecutionPlanStore,
  MemoryExecutionPlanStore,
} from "../agents/multi-chain/execution-store.js";
import { PersistentExecutionPlanRunner } from "../agents/multi-chain/persistent-execution-runner.js";
import type { UniversalExecutionResult } from "../agents/multi-chain/types.js";

function plan(): MultiChainExecutionPlan {
  const baseAction = {
    label: "Deploy",
    risk: "low" as const,
    requiresWallet: false,
    requiresGas: false,
    automated: true,
    completed: false,
  };
  return {
    opportunityId: "opp-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    executable: false,
    blockers: ["verify:dependency:deploy"],
    nodes: [
      {
        id: "deploy",
        action: { ...baseAction, id: "deploy-core" },
        actionKind: "deploy-contract",
        dependencyIds: [],
        chainKey: "baseSepolia",
        idempotencyKey: "drop-hunter:opp-1:deploy-core",
        status: "ready",
        blockers: [],
      },
      {
        id: "verify",
        action: { ...baseAction, id: "verify-contract", label: "Verify" },
        actionKind: "verify-contract",
        dependencyIds: ["deploy"],
        chainKey: "baseSepolia",
        idempotencyKey: "drop-hunter:opp-1:verify-contract",
        status: "blocked",
        blockers: ["dependency:deploy"],
      },
    ],
  };
}

class SuccessExecutor implements ExecutionPlanNodeExecutor {
  calls: string[] = [];

  execute(node: ExecutionPlanNode): UniversalExecutionResult {
    this.calls.push(node.id);
    return {
      status: "success",
      actionId: node.id,
      chainKey: node.chainKey ?? "unresolved",
      timestamp: "2026-01-01T00:00:00.000Z",
      executionId: `exec:${node.id}`,
    };
  }
}

describe("PersistentExecutionPlanRunner", () => {
  it("initializes a plan once and preserves the existing state", async () => {
    const store = new MemoryExecutionPlanStore();
    const runner = new PersistentExecutionPlanRunner(
      new ExecutionPlanRunner(new SuccessExecutor()),
      store,
      { now: () => new Date("2026-01-01T00:00:00.000Z") },
    );

    const first = await runner.initialize("plan-1", plan());
    const second = await runner.initialize("plan-1", { ...plan(), opportunityId: "changed" });

    expect(first.plan.opportunityId).to.equal("opp-1");
    expect(second.plan.opportunityId).to.equal("opp-1");
    expect(second.version).to.equal(1);
  });

  it("persists progress and resumes from the stored plan", async () => {
    const store = new MemoryExecutionPlanStore();
    const executor = new SuccessExecutor();
    const firstProcess = new PersistentExecutionPlanRunner(new ExecutionPlanRunner(executor), store);
    await firstProcess.initialize("plan-1", plan());

    const firstPass = await firstProcess.runReady("plan-1");
    expect(firstPass.completedNodeIds).to.include("deploy");

    const secondProcess = new PersistentExecutionPlanRunner(new ExecutionPlanRunner(executor), store);
    const secondPass = await secondProcess.runReady("plan-1");

    expect(secondPass.completedNodeIds).to.include.members(["deploy", "verify"]);
    expect(executor.calls).to.deep.equal(["deploy", "verify"]);
    const persisted = await secondProcess.load("plan-1");
    expect(persisted?.records).to.have.length(2);
    expect(persisted?.version).to.equal(3);
  });

  it("runs through the DAG and persists the terminal plan", async () => {
    const store = new MemoryExecutionPlanStore();
    const persistent = new PersistentExecutionPlanRunner(
      new ExecutionPlanRunner(new SuccessExecutor()),
      store,
    );
    await persistent.initialize("plan-1", plan());

    const result = await persistent.runUntilBlocked("plan-1");
    const stored = await persistent.load("plan-1");

    expect(result.completedNodeIds).to.deep.equal(["deploy", "verify"]);
    expect(stored?.plan.nodes.every((node) => node.status === "completed")).to.equal(true);
    expect(stored?.records).to.have.length(2);
  });

  it("throws when attempting to run an unknown plan", async () => {
    const persistent = new PersistentExecutionPlanRunner(
      new ExecutionPlanRunner(new SuccessExecutor()),
      new MemoryExecutionPlanStore(),
    );

    let message = "";
    try {
      await persistent.runReady("missing");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).to.equal("execution plan not found: missing");
  });

  it("writes and reloads execution state from a JSON file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-hub-execution-store-"));
    const filePath = join(directory, "execution.json");

    try {
      const store = new JsonFileExecutionPlanStore(filePath);
      const persistent = new PersistentExecutionPlanRunner(
        new ExecutionPlanRunner(new SuccessExecutor()),
        store,
      );
      await persistent.initialize("plan-1", plan());
      await persistent.runReady("plan-1");

      const reloaded = new JsonFileExecutionPlanStore(filePath);
      const state = await reloaded.get("plan-1");
      const raw = JSON.parse(await readFile(filePath, "utf8")) as { version: number };

      expect(raw.version).to.equal(1);
      expect(state?.plan.nodes.find((node) => node.id === "deploy")?.status).to.equal("completed");
      expect(state?.records).to.have.length(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("deletes a persisted plan", async () => {
    const store = new MemoryExecutionPlanStore();
    const persistent = new PersistentExecutionPlanRunner(
      new ExecutionPlanRunner(new SuccessExecutor()),
      store,
    );
    await persistent.initialize("plan-1", plan());

    expect(await persistent.delete("plan-1")).to.equal(true);
    expect(await persistent.load("plan-1")).to.equal(undefined);
  });
});
