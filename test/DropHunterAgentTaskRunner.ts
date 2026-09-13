import { expect } from "chai";
import {
  DropHunterAgentTaskRunner,
  DropHunterProductControlPlane,
  DropHunterProjectRepository,
  MemoryDropHunterProductStore,
  type DropHunterAgentTaskExecutionContext,
  type DropHunterAgentTaskExecutionResult,
  type DropHunterAgentTaskExecutor,
} from "../agents/drop-hunter/index.js";
import type { ScoredOpportunity } from "../agents/drop-hunter/types.js";
import type { DropTask } from "../agents/drop-hunter/task-model.js";

const opportunity: ScoredOpportunity = {
  id: "project-1",
  name: "Project One",
  vm: "EVM",
  stage: "testnet",
  priority: 90,
  signals: {},
  sources: ["docs"],
  actions: [],
  score: 90,
  confidence: 0.9,
  reasons: [],
};

const checkIn: DropTask = {
  id: "checkin",
  opportunityId: opportunity.id,
  title: "Daily check-in",
  description: "Daily check-in",
  kind: "check-in",
  risk: "low",
  automated: true,
  requiresWallet: false,
  requiresGas: false,
  requiresUserApproval: false,
  prerequisites: [],
  evidenceRequired: [],
  source: "docs",
};

class RecordingCheckInExecutor implements DropHunterAgentTaskExecutor {
  readonly kinds = ["check-in"] as const;
  calls: DropHunterAgentTaskExecutionContext[] = [];

  constructor(private readonly result: DropHunterAgentTaskExecutionResult = { status: "completed" }) {}

  async execute(context: DropHunterAgentTaskExecutionContext): Promise<DropHunterAgentTaskExecutionResult> {
    this.calls.push(context);
    return this.result;
  }
}

async function setup(tasks: DropTask[]) {
  const store = new MemoryDropHunterProductStore();
  const repository = new DropHunterProjectRepository(store);
  await repository.upsert({ opportunity, tasks });
  const control = new DropHunterProductControlPlane(store, repository);
  return { store, repository, control };
}

describe("DropHunterAgentTaskRunner", () => {
  it("executes autonomous tasks and persists completion", async () => {
    const { store, control } = await setup([checkIn]);
    const executor = new RecordingCheckInExecutor();
    const runner = new DropHunterAgentTaskRunner(control, [executor]);
    const result = await runner.runOnce();

    expect(result.executed).to.equal(1);
    expect(result.completed).to.equal(1);
    expect(executor.calls).to.have.length(1);
    const project = await store.getProject(opportunity.id);
    expect(project?.tasks[0].status).to.equal("completed");
    expect(project?.tasks[0].attempts).to.equal(1);
  });

  it("does not execute approval-gated wallet tasks", async () => {
    const bridge: DropTask = {
      ...checkIn,
      id: "bridge",
      kind: "bridge",
      title: "Bridge",
      requiresWallet: true,
      requiresGas: true,
      requiresUserApproval: true,
      risk: "medium",
    };
    const { store, control } = await setup([bridge]);
    const executor = new RecordingCheckInExecutor();
    const runner = new DropHunterAgentTaskRunner(control, [executor]);
    const result = await runner.runOnce();

    expect(result.executed).to.equal(0);
    expect(executor.calls).to.have.length(0);
    expect((await store.getProject(opportunity.id))?.tasks[0].status).to.equal("pending");
  });

  it("persists executor failures and keeps them visible for retry", async () => {
    const { store, control } = await setup([checkIn]);
    const executor = new RecordingCheckInExecutor({ status: "failed", note: "temporary outage" });
    const runner = new DropHunterAgentTaskRunner(control, [executor]);
    const result = await runner.runOnce();

    expect(result.failed).to.equal(1);
    const task = (await store.getProject(opportunity.id))?.tasks[0];
    expect(task?.status).to.equal("failed");
    expect(task?.lastError).to.equal("temporary outage");
    expect(task?.attempts).to.equal(1);
  });

  it("never executes more than the configured per-run limit", async () => {
    const { control } = await setup([
      checkIn,
      { ...checkIn, id: "checkin-2", title: "Second check-in" },
    ]);
    const executor = new RecordingCheckInExecutor();
    const runner = new DropHunterAgentTaskRunner(control, [executor], { maxTasksPerRun: 1 });
    const result = await runner.runOnce();

    expect(result.executed).to.equal(1);
    expect(executor.calls).to.have.length(1);
  });
});
