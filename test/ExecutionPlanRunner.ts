import { expect } from "chai";
import {
  ExecutionPlanRunner,
  type ExecutionPlanNode,
  type ExecutionPlanNodeExecutor,
  type MultiChainExecutionPlan,
  type UniversalExecutionResult,
} from "../agents/multi-chain/index.js";

function node(
  id: string,
  status: ExecutionPlanNode["status"],
  dependencyIds: string[] = [],
): ExecutionPlanNode {
  return {
    id,
    action: {
      id,
      label: id,
      risk: "low",
      requiresWallet: false,
      requiresGas: false,
      automated: true,
      completed: status === "completed",
    },
    actionKind: "custom",
    dependencyIds,
    chainKey: "baseSepolia",
    status,
    blockers: status === "blocked" ? dependencyIds.map((dependencyId) => `dependency:${dependencyId}`) : [],
  };
}

function plan(nodes: ExecutionPlanNode[]): MultiChainExecutionPlan {
  return {
    opportunityId: "opportunity-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    nodes,
    executable: nodes.every((item) => item.status === "ready" || item.status === "completed"),
    blockers: nodes.flatMap((item) => item.blockers.map((blocker) => `${item.id}:${blocker}`)),
  };
}

class RecordingExecutor implements ExecutionPlanNodeExecutor {
  calls: string[] = [];

  constructor(private readonly results: Record<string, UniversalExecutionResult["status"]> = {}) {}

  execute(item: ExecutionPlanNode): UniversalExecutionResult {
    this.calls.push(item.id);
    const status = this.results[item.id] ?? "success";
    return {
      status,
      actionId: item.id,
      chainKey: item.chainKey ?? "unresolved",
      timestamp: "2026-01-01T00:00:00.000Z",
      note: status === "failed" ? "boom" : status === "skipped" ? "dry-run" : "ok",
    };
  }
}

describe("ExecutionPlanRunner", () => {
  it("executes only currently ready nodes", async () => {
    const executor = new RecordingExecutor();
    const runner = new ExecutionPlanRunner(executor);
    const input = plan([
      node("deploy-core", "ready"),
      node("register-chain", "blocked", ["deploy-core"]),
    ]);

    const result = await runner.runReady(input);

    expect(executor.calls).to.deep.equal(["deploy-core"]);
    expect(result.plan.nodes[0].status).to.equal("completed");
    expect(result.plan.nodes[1].status).to.equal("ready");
  });

  it("propagates dependency failure to downstream nodes", async () => {
    const executor = new RecordingExecutor({ "deploy-core": "failed" });
    const runner = new ExecutionPlanRunner(executor);
    const input = plan([
      node("deploy-core", "ready"),
      node("register-chain", "blocked", ["deploy-core"]),
    ]);

    const result = await runner.runReady(input);

    expect(result.failedNodeIds).to.deep.equal(["deploy-core"]);
    expect(result.plan.nodes[1].status).to.equal("blocked");
    expect(result.plan.nodes[1].blockers).to.deep.equal(["dependency-failed:deploy-core"]);
  });

  it("does not unlock dependencies when execution is skipped", async () => {
    const executor = new RecordingExecutor({ "deploy-core": "skipped" });
    const runner = new ExecutionPlanRunner(executor);
    const input = plan([
      node("deploy-core", "ready"),
      node("register-chain", "blocked", ["deploy-core"]),
    ]);

    const result = await runner.runReady(input);

    expect(result.skippedNodeIds).to.deep.equal(["deploy-core"]);
    expect(result.plan.nodes[0].status).to.equal("ready");
    expect(result.plan.nodes[1].status).to.equal("blocked");
  });

  it("runs successive dependency layers until completion", async () => {
    const executor = new RecordingExecutor();
    const runner = new ExecutionPlanRunner(executor);
    const input = plan([
      node("deploy-core", "ready"),
      node("deploy-evm-adapter", "blocked", ["deploy-core"]),
      node("register-chain", "blocked", ["deploy-core", "deploy-evm-adapter"]),
      node("record-activity", "blocked", ["register-chain"]),
    ]);

    const result = await runner.runUntilBlocked(input);

    expect(executor.calls).to.deep.equal([
      "deploy-core",
      "deploy-evm-adapter",
      "register-chain",
      "record-activity",
    ]);
    expect(result.plan.nodes.every((item) => item.status === "completed")).to.equal(true);
    expect(result.stalled).to.equal(false);
  });

  it("stops when a pass makes no successful progress", async () => {
    const executor = new RecordingExecutor({ "deploy-core": "skipped" });
    const runner = new ExecutionPlanRunner(executor);
    const input = plan([
      node("deploy-core", "ready"),
      node("register-chain", "blocked", ["deploy-core"]),
    ]);

    const result = await runner.runUntilBlocked(input);

    expect(executor.calls).to.deep.equal(["deploy-core"]);
    expect(result.plan.nodes[0].status).to.equal("ready");
    expect(result.plan.nodes[1].status).to.equal("blocked");
  });

  it("does not mutate the caller's original plan", async () => {
    const executor = new RecordingExecutor();
    const runner = new ExecutionPlanRunner(executor);
    const input = plan([node("deploy-core", "ready")]);

    const result = await runner.runReady(input);

    expect(input.nodes[0].status).to.equal("ready");
    expect(input.nodes[0].action.completed).to.equal(false);
    expect(result.plan.nodes[0].status).to.equal("completed");
  });
});
