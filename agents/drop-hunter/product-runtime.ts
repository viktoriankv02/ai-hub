import type { DropHunterAgentRunResult } from "./agent-task-runner.js";
import type { DropHunterIngestionResult } from "./product-ingestion.js";

export interface DropHunterProductRuntimeControl {
  scan(): Promise<DropHunterIngestionResult>;
}

export interface DropHunterProductRuntimeAgent {
  runOnce(): Promise<DropHunterAgentRunResult>;
}

export interface DropHunterProductRuntimeOptions {
  scanIntervalMs?: number;
  tickIntervalMs?: number;
  now?: () => Date;
  onCycle?: (cycle: DropHunterProductRuntimeCycle) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
}

export interface DropHunterProductRuntimeCycle {
  startedAt: string;
  completedAt: string;
  scanned: boolean;
  scan?: {
    discovered: number;
    storedProjects: number;
    successfulSources: string[];
    failedSources: number;
    warnings: string[];
  };
  agent: DropHunterAgentRunResult;
  errors: string[];
}

export class DropHunterProductRuntime {
  private readonly scanIntervalMs: number;
  private readonly tickIntervalMs: number;
  private readonly now: () => Date;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private lastScanAt?: number;
  private latest?: DropHunterProductRuntimeCycle;

  constructor(
    private readonly control: DropHunterProductRuntimeControl,
    private readonly agent: DropHunterProductRuntimeAgent,
    private readonly options: DropHunterProductRuntimeOptions = {},
  ) {
    this.scanIntervalMs = options.scanIntervalMs ?? 15 * 60_000;
    this.tickIntervalMs = options.tickIntervalMs ?? 60_000;
    this.now = options.now ?? (() => new Date());
    if (!Number.isFinite(this.scanIntervalMs) || this.scanIntervalMs < 60_000) throw new Error("scanIntervalMs must be at least 60000");
    if (!Number.isFinite(this.tickIntervalMs) || this.tickIntervalMs < 60_000) throw new Error("tickIntervalMs must be at least 60000");
  }

  get active(): boolean { return this.timer !== undefined; }
  get lastCycle(): DropHunterProductRuntimeCycle | undefined { return this.latest ? structuredClone(this.latest) : undefined; }

  async runOnce(forceScan = false): Promise<DropHunterProductRuntimeCycle> {
    if (this.running) throw new Error("Drop Hunter product runtime cycle is already running");
    this.running = true;
    const started = this.now();
    const errors: string[] = [];
    let scanSummary: DropHunterProductRuntimeCycle["scan"];
    let scanned = false;

    try {
      const shouldScan = forceScan || this.lastScanAt === undefined || started.getTime() - this.lastScanAt >= this.scanIntervalMs;
      if (shouldScan) {
        scanned = true;
        try {
          const result = await this.control.scan();
          this.lastScanAt = started.getTime();
          scanSummary = {
            discovered: result.discovery.opportunities.length,
            storedProjects: result.projects.length,
            successfulSources: [...result.discovery.successfulSources],
            failedSources: result.discovery.failedSources.length,
            warnings: [...result.warnings],
          };
        } catch (error) {
          errors.push(`scan: ${message(error)}`);
          await this.options.onError?.(error);
        }
      }

      let agent: DropHunterAgentRunResult;
      try {
        agent = await this.agent.runOnce();
      } catch (error) {
        errors.push(`agent: ${message(error)}`);
        await this.options.onError?.(error);
        agent = { considered: 0, executed: 0, completed: 0, failed: 0, skipped: 0, records: [] };
      }

      const cycle: DropHunterProductRuntimeCycle = {
        startedAt: started.toISOString(),
        completedAt: this.now().toISOString(),
        scanned,
        scan: scanSummary,
        agent,
        errors,
      };
      this.latest = cycle;
      await this.options.onCycle?.(cycle);
      return structuredClone(cycle);
    } finally {
      this.running = false;
    }
  }

  start(runImmediately = true): void {
    if (this.timer) return;
    if (runImmediately) void this.runOnce(true).catch((error) => this.options.onError?.(error));
    this.timer = setInterval(() => {
      if (this.running) return;
      void this.runOnce(false).catch((error) => this.options.onError?.(error));
    }, this.tickIntervalMs);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
