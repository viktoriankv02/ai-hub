import { DropHunterService, type ServiceExecutionOptions } from "./service.js";
import { DropHunterScheduler, type DropHunterSchedulerOptions, type SchedulerCycle } from "./scheduler.js";
import type { OpportunitySource } from "./opportunity-source.js";
import { FileDropHunterSchedulerStateStore } from "./file-scheduler-store.js";
import type { ExecutionHandler } from "./execution-runner.js";

export interface DropHunterRuntimeOptions {
  stateFile?: string;
  scheduler: Omit<DropHunterSchedulerOptions, "stateStore">;
  scanProfile?: Parameters<DropHunterService["scanResilient"]>[0]["profile"];
}

export interface DropHunterRuntime {
  service: DropHunterService;
  scheduler: DropHunterScheduler;
  start(runImmediately?: boolean): Promise<void>;
  stop(): void;
  scanOnce(): Promise<SchedulerCycle>;
  execute(cycle: SchedulerCycle, options: ServiceExecutionOptions, handlers: Record<string, ExecutionHandler>): Promise<unknown[]>;
}

export function createDropHunterRuntime(sources: OpportunitySource[], options: DropHunterRuntimeOptions): DropHunterRuntime {
  const service = new DropHunterService(sources);
  const stateStore = options.stateFile ? new FileDropHunterSchedulerStateStore(options.stateFile) : undefined;
  const scheduler = new DropHunterScheduler(service, { profile: options.scanProfile }, { ...options.scheduler, stateStore });
  return {
    service,
    scheduler,
    async start(runImmediately = true) { await scheduler.startAsync(runImmediately); },
    stop() { scheduler.stop(); },
    async scanOnce() { return scheduler.tick(); },
    async execute(cycle, executionOptions, handlers) {
      const runs = [] as unknown[];
      for (const item of cycle.cycles) {
        const result = await service.execute(item, executionOptions, handlers);
        runs.push(...result);
      }
      return runs;
    },
  };
}
