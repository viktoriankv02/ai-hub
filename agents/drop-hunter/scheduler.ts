import type { DropHunterCycleResult } from "./engine.js";
import type { ServiceScanOptions } from "./service.js";
import { DropHunterService } from "./service.js";
import {
  emptyDropHunterSchedulerState,
  type DropHunterSchedulerState,
  type DropHunterSchedulerStateStore,
} from "./scheduler-store.js";

export interface DropHunterSchedulerOptions {
  intervalMs: number;
  now?: () => string;
  onCycle?: (result: SchedulerCycle) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
  stateStore?: DropHunterSchedulerStateStore;
}

export interface SchedulerCycle {
  timestamp: string;
  cycles: DropHunterCycleResult[];
  failedSources: Array<{ sourceId: string; error: string }>;
}

/**
 * Resilient process-local scheduler. It owns no wallet and never executes
 * actions; it only drives discovery + scoring/planning.
 */
export class DropHunterScheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private initialized = false;
  private stateValue: DropHunterSchedulerState = emptyDropHunterSchedulerState();

  constructor(
    private readonly service: DropHunterService,
    private readonly scanOptions: Omit<ServiceScanOptions, "observedAt">,
    private readonly options: DropHunterSchedulerOptions,
  ) {
    if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
      throw new Error("scheduler interval must be a positive finite number");
    }
  }

  get active(): boolean { return this.timer !== undefined; }
  get runningTick(): boolean { return this.running; }
  get ready(): boolean { return this.initialized; }
  get state(): DropHunterSchedulerState {
    return {
      ...this.stateValue,
      lastCycle: this.stateValue.lastCycle && { ...this.stateValue.lastCycle },
    };
  }

  async loadState(): Promise<DropHunterSchedulerState> {
    if (this.initialized) return this.state;
    const loaded = await this.options.stateStore?.load();
    if (loaded) this.stateValue = loaded;
    this.initialized = true;
    return this.state;
  }

  async tick(): Promise<SchedulerCycle> {
    if (this.running) throw new Error("scheduler tick already running");
    if (!this.initialized) await this.loadState();

    this.running = true;
    const timestamp = this.options.now?.() ?? new Date().toISOString();
    this.stateValue = {
      ...this.stateValue,
      lastStartedAt: timestamp,
      totalTicks: this.stateValue.totalTicks + 1,
    };
    await this.persist();
    try {
      const result = await this.service.scanResilient({
        ...this.scanOptions,
        observedAt: timestamp,
      }, timestamp);
      const cycle: SchedulerCycle = {
        timestamp,
        cycles: result.cycles,
        failedSources: result.discovery.failedSources,
      };
      this.stateValue = {
        ...this.stateValue,
        lastCompletedAt: timestamp,
        lastCycle: {
          timestamp,
          cycleCount: cycle.cycles.length,
          failedSourceCount: cycle.failedSources.length,
        },
        successfulTicks: this.stateValue.successfulTicks + 1,
        consecutiveFailures: 0,
      };
      await this.persist();
      await this.options.onCycle?.(cycle);
      return cycle;
    } catch (error) {
      this.stateValue = {
        ...this.stateValue,
        lastErrorAt: timestamp,
        failedTicks: this.stateValue.failedTicks + 1,
        consecutiveFailures: this.stateValue.consecutiveFailures + 1,
      };
      await this.persist();
      await this.options.onError?.(error);
      throw error;
    } finally {
      this.running = false;
    }
  }

  /**
   * Lifecycle-safe async startup. State is restored before the first tick or
   * timer is created, preventing a restart from racing persisted state load.
   */
  async startAsync(runImmediately = true): Promise<void> {
    await this.loadState();
    if (this.timer) return;

    if (runImmediately) await this.tick();
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick().catch(() => undefined);
    }, this.options.intervalMs);
  }

  start(runImmediately = true): void {
    if (this.timer) return;
    if (runImmediately) void this.tick().catch(() => undefined);
    this.timer = setInterval(() => {
      void this.tick().catch(() => undefined);
    }, this.options.intervalMs);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async persist(): Promise<void> {
    await this.options.stateStore?.save(this.stateValue);
  }
}
