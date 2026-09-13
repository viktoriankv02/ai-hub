import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DropHunterAgentRunResult } from "./agent-task-runner.js";

export type DropHunterAgentRuntimeState = "idle" | "running" | "stopped" | "error";

export interface DropHunterAgentRuntimeStatus {
  version: 1;
  state: DropHunterAgentRuntimeState;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  nextRunAt?: string;
  intervalMs: number;
  trustedCheckIns: number;
  lastResult?: DropHunterAgentRunResult;
  lastError?: string;
}

export interface DropHunterAgentRuntimeStatusStore {
  read(): Promise<DropHunterAgentRuntimeStatus | undefined>;
  write(status: DropHunterAgentRuntimeStatus): Promise<void>;
}

export class JsonFileDropHunterAgentRuntimeStatusStore implements DropHunterAgentRuntimeStatusStore {
  readonly filePath: string;
  private writes: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    if (!filePath.trim()) throw new Error("agent runtime status path cannot be empty");
    this.filePath = resolve(filePath);
  }

  async read(): Promise<DropHunterAgentRuntimeStatus | undefined> {
    await this.writes;
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<DropHunterAgentRuntimeStatus>;
      if (parsed.version !== 1 || typeof parsed.state !== "string" || typeof parsed.updatedAt !== "string") {
        throw new Error("invalid Drop Hunter agent runtime status format");
      }
      return structuredClone(parsed as DropHunterAgentRuntimeStatus);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async write(status: DropHunterAgentRuntimeStatus): Promise<void> {
    const operation = this.writes.then(() => this.writeAtomic(status), () => this.writeAtomic(status));
    this.writes = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async writeAtomic(status: DropHunterAgentRuntimeStatus): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
    try {
      await rename(tempPath, this.filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform !== "win32" || (code !== "EEXIST" && code !== "EPERM")) {
        await rm(tempPath, { force: true });
        throw error;
      }
      await rm(this.filePath, { force: true });
      await rename(tempPath, this.filePath);
    }
  }
}

export function isDropHunterAgentStatusStale(status: DropHunterAgentRuntimeStatus, now = new Date()): boolean {
  const updatedAt = Date.parse(status.updatedAt);
  return !Number.isFinite(updatedAt) || now.getTime() - updatedAt > Math.max(status.intervalMs * 2, 120_000);
}
