import type { DropHunterAgentRunResult, DropHunterAgentTaskRunner } from "./agent-task-runner.js";
import type { DropHunterAgentRuntimeStatus, DropHunterAgentRuntimeStatusStore } from "./agent-runtime-status.js";

export interface DropHunterAgentRuntimeControllerOptions {
  intervalMs: number;
  trustedCheckIns: number;
  now?: () => Date;
}

export class DropHunterAgentRuntimeController {
  private running = false;
  private readonly now: () => Date;

  constructor(
    private readonly runner: Pick<DropHunterAgentTaskRunner, "runOnce">,
    private readonly status: DropHunterAgentRuntimeStatusStore,
    private readonly options: DropHunterAgentRuntimeControllerOptions,
  ) {
    if (!Number.isInteger(options.intervalMs) || options.intervalMs < 60_000) {
      throw new Error("agent runtime intervalMs must be at least 60000");
    }
    this.now = options.now ?? (() => new Date());
  }

  get active(): boolean { return this.running; }

  async runOnce(): Promise<DropHunterAgentRunResult> {
    if (this.running) throw new Error("Drop Hunter agent cycle is already running");
    this.running = true;
    const startedAt = this.now().toISOString();
    await this.status.write(this.snapshot("running", startedAt, { startedAt }));
    try {
      const result = await this.runner.runOnce();
      const completedAt = this.now().toISOString();
      await this.status.write(this.snapshot("idle", completedAt, {
        startedAt,
        completedAt,
        nextRunAt: new Date(this.now().getTime() + this.options.intervalMs).toISOString(),
        lastResult: result,
      }));
      return result;
    } catch (error) {
      const completedAt = this.now().toISOString();
      await this.status.write(this.snapshot("error", completedAt, {
        startedAt,
        completedAt,
        nextRunAt: new Date(this.now().getTime() + this.options.intervalMs).toISOString(),
        lastError: error instanceof Error ? error.message : String(error),
      }));
      throw error;
    } finally {
      this.running = false;
    }
  }

  private snapshot(
    state: DropHunterAgentRuntimeStatus["state"],
    updatedAt: string,
    details: Partial<DropHunterAgentRuntimeStatus>,
  ): DropHunterAgentRuntimeStatus {
    return {
      version: 1,
      state,
      updatedAt,
      intervalMs: this.options.intervalMs,
      trustedCheckIns: this.options.trustedCheckIns,
      ...details,
    };
  }
}
