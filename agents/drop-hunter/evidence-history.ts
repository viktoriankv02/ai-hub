import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DropTaskKind } from "./task-model.js";

export type DropHunterEvidenceOutcome = "success" | "failed" | "skipped" | "unknown";
export type DropHunterRewardOutcome = "rewarded" | "not-rewarded" | "pending" | "unknown";

export interface DropHunterEvidenceRecord {
  id: string;
  projectId: string;
  taskId: string;
  taskKind: DropTaskKind;
  timestamp: string;
  outcome: DropHunterEvidenceOutcome;
  rewardOutcome: DropHunterRewardOutcome;
  source?: string;
  chainId?: number;
  walletAddress?: string;
  transactionHash?: string;
  contractAddress?: string;
  blockNumber?: number;
  reference?: string;
  note?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface DropHunterEvidenceSnapshot {
  version: 1;
  records: DropHunterEvidenceRecord[];
}

export interface DropHunterEvidenceStore {
  append(record: DropHunterEvidenceRecord): Promise<void>;
  list(): Promise<DropHunterEvidenceRecord[]>;
  listProject(projectId: string): Promise<DropHunterEvidenceRecord[]>;
  listTask(projectId: string, taskId: string): Promise<DropHunterEvidenceRecord[]>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class MemoryDropHunterEvidenceStore implements DropHunterEvidenceStore {
  private readonly records: DropHunterEvidenceRecord[] = [];

  async append(record: DropHunterEvidenceRecord): Promise<void> {
    this.records.push(clone(record));
  }

  async list(): Promise<DropHunterEvidenceRecord[]> {
    return this.records.map(clone);
  }

  async listProject(projectId: string): Promise<DropHunterEvidenceRecord[]> {
    return this.records.filter((record) => record.projectId === projectId).map(clone);
  }

  async listTask(projectId: string, taskId: string): Promise<DropHunterEvidenceRecord[]> {
    return this.records.filter((record) => record.projectId === projectId && record.taskId === taskId).map(clone);
  }
}

export class JsonFileDropHunterEvidenceStore implements DropHunterEvidenceStore {
  readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    if (!filePath.trim()) throw new Error("drop hunter evidence store path cannot be empty");
    this.filePath = resolve(filePath);
  }

  async append(record: DropHunterEvidenceRecord): Promise<void> {
    await this.enqueue(async () => {
      const snapshot = await this.readSnapshot();
      snapshot.records.push(clone(record));
      snapshot.records.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
      await this.writeSnapshot(snapshot);
    });
  }

  async list(): Promise<DropHunterEvidenceRecord[]> {
    await this.writeQueue;
    return (await this.readSnapshot()).records.map(clone);
  }

  async listProject(projectId: string): Promise<DropHunterEvidenceRecord[]> {
    return (await this.list()).filter((record) => record.projectId === projectId);
  }

  async listTask(projectId: string, taskId: string): Promise<DropHunterEvidenceRecord[]> {
    return (await this.list()).filter((record) => record.projectId === projectId && record.taskId === taskId);
  }

  private async enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(operation, operation);
    this.writeQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private async readSnapshot(): Promise<DropHunterEvidenceSnapshot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<DropHunterEvidenceSnapshot>;
      if (parsed.version !== 1 || !Array.isArray(parsed.records)) throw new Error("invalid drop hunter evidence store format");
      return { version: 1, records: clone(parsed.records) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, records: [] };
      throw error;
    }
  }

  private async writeSnapshot(snapshot: DropHunterEvidenceSnapshot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
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

export function createEvidenceRecord(input: Omit<DropHunterEvidenceRecord, "id" | "timestamp"> & { id?: string; timestamp?: string }): DropHunterEvidenceRecord {
  return {
    ...clone(input),
    id: input.id ?? randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
}
