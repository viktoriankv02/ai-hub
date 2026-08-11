import { expect } from "chai";
import { DropHunterService, StaticOpportunitySource } from "../agents/drop-hunter/index.js";
import { DropHunterScheduler } from "../agents/drop-hunter/scheduler.js";

describe("Drop Hunter scheduler", function () {
  it("runs a deterministic tick through resilient discovery", async function () {
    const service = new DropHunterService([
      new StaticOpportunitySource("catalog", "Catalog", [{
        id: "scheduler-opportunity",
        name: "Scheduler Opportunity",
        vm: "EVM",
        stage: "testnet",
        priority: 80,
        signals: { testnetActivity: 90 },
        sources: ["catalog"],
        actions: ["deploy-contract"],
      }]),
    ]);
    const scheduler = new DropHunterScheduler(service, { profile: {} }, {
      intervalMs: 1000,
      now: () => "2026-08-10T21:00:00.000Z",
    });

    const cycle = await scheduler.tick();
    expect(cycle.timestamp).to.equal("2026-08-10T21:00:00.000Z");
    expect(cycle.cycles).to.have.length(1);
    expect(cycle.cycles[0].opportunity.id).to.equal("scheduler-opportunity");
    expect(cycle.failedSources).to.deep.equal([]);
    expect(scheduler.ready).to.equal(true);
  });

  it("starts and stops without creating duplicate timers", function () {
    const service = new DropHunterService([new StaticOpportunitySource("catalog", "Catalog", [])]);
    const scheduler = new DropHunterScheduler(service, { profile: {} }, { intervalMs: 60_000 });

    expect(scheduler.active).to.equal(false);
    scheduler.start(false);
    expect(scheduler.active).to.equal(true);
    scheduler.start(false);
    expect(scheduler.active).to.equal(true);
    scheduler.stop();
    expect(scheduler.active).to.equal(false);
    scheduler.stop();
    expect(scheduler.active).to.equal(false);
  });

  it("restores persisted state before async startup executes the first tick", async function () {
    let loads = 0;
    let saves = 0;
    const service = new DropHunterService([new StaticOpportunitySource("catalog", "Catalog", [])]);
    const scheduler = new DropHunterScheduler(service, { profile: {} }, {
      intervalMs: 60_000,
      now: () => "2026-08-10T21:05:00.000Z",
      stateStore: {
        async load() {
          loads += 1;
          return {
            version: 1 as const,
            totalTicks: 10,
            successfulTicks: 9,
            failedTicks: 1,
            consecutiveFailures: 0,
            lastCompletedAt: "2026-08-10T21:00:00.000Z",
          };
        },
        async save(state) {
          saves += 1;
          expect(state.totalTicks).to.be.at.least(10);
        },
      },
    });

    await scheduler.startAsync(true);

    expect(loads).to.equal(1);
    expect(saves).to.be.at.least(2);
    expect(scheduler.state.totalTicks).to.equal(11);
    expect(scheduler.state.successfulTicks).to.equal(10);
    expect(scheduler.active).to.equal(true);
    scheduler.stop();
  });

  it("does not create duplicate timers when async startup is called twice", async function () {
    const service = new DropHunterService([new StaticOpportunitySource("catalog", "Catalog", [])]);
    const scheduler = new DropHunterScheduler(service, { profile: {} }, { intervalMs: 60_000 });

    await Promise.all([scheduler.startAsync(false), scheduler.startAsync(false)]);
    expect(scheduler.active).to.equal(true);
    scheduler.stop();
  });

  it("rejects an invalid interval and overlapping ticks", async function () {
    const service = new DropHunterService([new StaticOpportunitySource("catalog", "Catalog", [])]);
    expect(() => new DropHunterScheduler(service, { profile: {} }, { intervalMs: 0 })).to.throw("positive finite");

    const scheduler = new DropHunterScheduler(service, { profile: {} }, { intervalMs: 1000 });
    const first = scheduler.tick();

    let error: unknown;
    try {
      await scheduler.tick();
    } catch (caught) {
      error = caught;
    }

    expect(error).to.be.instanceOf(Error);
    expect((error as Error).message).to.include("already running");
    await first;
  });
});
