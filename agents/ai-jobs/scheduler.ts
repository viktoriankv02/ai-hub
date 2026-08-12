import type { AIJobRecord } from "./types.js";
import { AIJobService } from "./service.js";

export interface AIJobSchedulerState {
  lastStartedAt?: string;
  lastCompletedAt?: string;
  lastErrorAt?: string;
  lastProcessedCount: number;
  lastSkippedCount: number;
  totalTicks: number;
  successfulTicks: number;
  failedTicks: number;
  consecutiveFailures: number;
}

export interface AIJobSchedulerStateStore {
  load(): Promise<AIJobSchedulerState | undefined>;
  save(state: AIJobSchedulerState): Promise<void>;
}

export interface AIJobSchedulerOptions {
  intervalMs: number;
  now?: () => string;
  runImmediately?: boolean;
  stateStore?: AIJobSchedulerStateStore;
  onCycle?: (cycle: AIJobSchedulerCycle) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
}

export interface AIJobSchedulerCycle {
  timestamp: string;
  processed: AIJobRecord[];
  skipped: AIJobRecord[];
}

export function emptyAIJobSchedulerState(): AIJobSchedulerState {
  return {
    lastProcessedCount: 0,
    lastSkippedCount: 0,
    totalTicks: 0,
    successfulTicks: 0,
    failedTicks: 0,
    consecutiveFailures: 0,
  };
}

/**
 * Periodically drains queued AI jobs while guaranteeing that two scheduler
 * ticks cannot overlap. Persistence is optional and lives behind a tiny
 * interface so the worker can use the existing JSON store or another backend.
 */
export class AIJobScheduler {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private initialized = false;
  private stateValue = emptyAIJobSchedulerState();

  constructor(
    private readonly service: AIJobService,
    private readonly options: AIJobSchedulerOptions,
  ) {
    if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
      throw new Error("AI job scheduler interval must be a positive finite number");
    }
  }

  get active(): boolean {
    return this.timer !== undefined;
  }

  get runningTick(): boolean {
    return this.running;
  }

  get ready(): boolean {
    return this.initialized;
  }

  get state(): AIJobSchedulerState {
    return { ...this.stateValue };
  }

  async loadState(): Promise<AIJobSchedulerState> {
    if (this.initialized) return this.state;
    const loaded = await this.options.stateStore?.load();
    if (loaded) this.stateValue = { ...emptyAIJobSchedulerState(), ...loaded };
    this.initialized = true;
    return this.state;
  }

  async tick(): Promise<AIJobSchedulerCycle> {
    if (this.running) throw new Error("AI job scheduler tick already running");
    this.running = true;

    try {
      if (!this.initialized) await this.loadState();

      const timestamp = this.options.now?.() ?? new Date().toISOString();
      this.stateValue = {
        ...this.stateValue,
        lastStartedAt: timestamp,
        totalTicks: this.stateValue.totalTicks + 1,
      };
      await this.persist();

      const result = await this.service.drain();
      const cycle: AIJobSchedulerCycle = {
        timestamp,
        processed: result.processed,
        skipped: result.skipped,
      };

      this.stateValue = {
        ...this.stateValue,
        lastCompletedAt: timestamp,
        lastProcessedCount: cycle.processed.length,
        lastSkippedCount: cycle.skipped.length,
        successfulTicks: this.stateValue.successfulTicks + 1,
        consecutiveFailures: 0,
      };
      await this.persist();
      await this.options.onCycle?.(cycle);
      return cycle;
    } catch (error) {
      const timestamp = this.options.now?.() ?? new Date().toISOString();
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

  async startAsync(runImmediately = this.options.runImmediately ?? true): Promise<void> {
    await this.loadState();
    if (this.timer) return;

    if (runImmediately) {
      await this.tick();
    }

    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick().catch(() => undefined);
    }, this.options.intervalMs);
  }

  start(runImmediately = this.options.runImmediately ?? true): void {
    if (this.timer) return;

    if (runImmediately) {
      void this.tick().catch(() => undefined);
    }

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
