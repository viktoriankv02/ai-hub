import { expect } from "chai";
import {
  AIJobOrchestrator,
  AIJobScheduler,
  AIJobService,
  type AIJobSchedulerState,
  DryRunAIExecutor,
  InMemoryAIJobStore,
} from "../agents/ai-jobs/index.js";

class MemorySchedulerStateStore {
  private value?: AIJobSchedulerState;

  async load(): Promise<AIJobSchedulerState | undefined> {
    return this.value ? { ...this.value } : undefined;
  }

  async save(state: AIJobSchedulerState): Promise<void> {
    this.value = { ...state };
  }
}

describe("AIJobScheduler", function () {
  function createService() {
    const orchestrator = new AIJobOrchestrator(new InMemoryAIJobStore(), {
      idFactory: (() => {
        let counter = 0;
        return () => `scheduler-job-${++counter}`;
      })(),
    });
    return { orchestrator, service: new AIJobService(orchestrator, new DryRunAIExecutor(), { batchSize: 2 }) };
  }

  it("drains a bounded batch and persists counters", async function () {
    const { orchestrator, service } = createService();
    const stateStore = new MemorySchedulerStateStore();

    for (let index = 0; index < 3; index += 1) {
      orchestrator.enqueue({
        idempotencyKey: `scheduler:${index}`,
        agentId: "1",
        taskHash: `task:${index}`,
        prompt: `run ${index}`,
        reward: "100",
        trigger: "schedule",
      });
    }

    const scheduler = new AIJobScheduler(service, {
      intervalMs: 60_000,
      now: () => "2026-08-12T17:00:00.000Z",
      stateStore,
    });

    const cycle = await scheduler.tick();

    expect(cycle.processed).to.have.length(2);
    expect(cycle.skipped).to.have.length(0);
    expect(scheduler.state.totalTicks).to.equal(1);
    expect(scheduler.state.successfulTicks).to.equal(1);
    expect(scheduler.state.lastProcessedCount).to.equal(2);

    const restored = new AIJobScheduler(service, {
      intervalMs: 60_000,
      stateStore,
    });
    await restored.loadState();
    expect(restored.state.totalTicks).to.equal(1);
    expect(restored.state.successfulTicks).to.equal(1);
  });

  it("does not allow overlapping ticks", async function () {
    const { orchestrator, service } = createService();
    orchestrator.enqueue({
      idempotencyKey: "overlap",
      agentId: "1",
      taskHash: "overlap-task",
      prompt: "overlap",
      reward: "1",
    });

    const first = service.drain.bind(service);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = false;

    service.drain = async () => {
      entered = true;
      await blocked;
      return first();
    };

    const scheduler = new AIJobScheduler(service, { intervalMs: 60_000 });
    const firstTick = scheduler.tick();

    while (!entered) await new Promise((resolve) => setTimeout(resolve, 1));

    await expect(scheduler.tick()).to.be.rejectedWith("already running");
    release();
    await firstTick;
    expect(scheduler.runningTick).to.equal(false);
  });

  it("starts once and stops cleanly", async function () {
    const { orchestrator, service } = createService();
    orchestrator.enqueue({
      idempotencyKey: "start-stop",
      agentId: "1",
      taskHash: "start-stop-task",
      prompt: "start-stop",
      reward: "1",
    });

    const scheduler = new AIJobScheduler(service, {
      intervalMs: 60_000,
      runImmediately: true,
    });

    await scheduler.startAsync();
    expect(scheduler.active).to.equal(true);
    expect(scheduler.ready).to.equal(true);
    expect(scheduler.state.totalTicks).to.equal(1);

    await scheduler.startAsync();
    expect(scheduler.state.totalTicks).to.equal(1);

    scheduler.stop();
    expect(scheduler.active).to.equal(false);
    scheduler.stop();
  });
});
