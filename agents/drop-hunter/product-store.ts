import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DropTask, DropOpportunityScore } from "./task-model.js";
import type { ScoredOpportunity } from "./types.js";

export type DropHunterProjectStatus = "new" | "active" | "paused" | "completed" | "archived";
export type DropHunterTaskStatus = "pending" | "ready" | "running" | "waiting-approval" | "completed" | "failed" | "skipped";

export interface StoredDropTask extends DropTask {
  status: DropHunterTaskStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  attempts: number;
  lastError?: string;
  txHashes?: string[];
  contractAddresses?: string[];
  lastBlockNumber?: number;
}

export interface DropHunterProjectRecord {
  id: string;
  opportunity: ScoredOpportunity;
  intelligence?: DropOpportunityScore;
  status: DropHunterProjectStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
  tasks: StoredDropTask[];
  tags: string[];
  notes?: string;
}

export interface DropHunterProductSnapshot {
  version: 1;
  projects: DropHunterProjectRecord[];
}

export interface DropHunterProductStore {
  getProject(id: string): Promise<DropHunterProjectRecord | undefined>;
  listProjects(): Promise<DropHunterProjectRecord[]>;
  putProject(project: DropHunterProjectRecord): Promise<void>;
  deleteProject(id: string): Promise<boolean>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class MemoryDropHunterProductStore implements DropHunterProductStore {
  private readonly projects = new Map<string, DropHunterProjectRecord>();

  async getProject(id: string): Promise<DropHunterProjectRecord | undefined> {
    const project = this.projects.get(id);
    return project ? clone(project) : undefined;
  }

  async listProjects(): Promise<DropHunterProjectRecord[]> {
    return [...this.projects.values()].map(clone);
  }

  async putProject(project: DropHunterProjectRecord): Promise<void> {
    this.projects.set(project.id, clone(project));
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }
}

export class JsonFileDropHunterProductStore implements DropHunterProductStore {
  readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    if (!filePath.trim()) throw new Error("drop hunter product store path cannot be empty");
    this.filePath = resolve(filePath);
  }

  async getProject(id: string): Promise<DropHunterProjectRecord | undefined> {
    await this.writeQueue;
    const snapshot = await this.readSnapshot();
    const project = snapshot.projects.find((item) => item.id === id);
    return project ? clone(project) : undefined;
  }

  async listProjects(): Promise<DropHunterProjectRecord[]> {
    await this.writeQueue;
    return (await this.readSnapshot()).projects.map(clone);
  }

  async putProject(project: DropHunterProjectRecord): Promise<void> {
    await this.enqueue(async () => {
      const snapshot = await this.readSnapshot();
      const projects = snapshot.projects.filter((item) => item.id !== project.id);
      projects.push(clone(project));
      projects.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || a.id.localeCompare(b.id));
      await this.writeSnapshot({ version: 1, projects });
    });
  }

  async deleteProject(id: string): Promise<boolean> {
    let deleted = false;
    await this.enqueue(async () => {
      const snapshot = await this.readSnapshot();
      const projects = snapshot.projects.filter((item) => item.id !== id);
      deleted = projects.length !== snapshot.projects.length;
      if (deleted) await this.writeSnapshot({ version: 1, projects });
    });
    return deleted;
  }

  private async enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(operation, operation);
    this.writeQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private async readSnapshot(): Promise<DropHunterProductSnapshot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<DropHunterProductSnapshot>;
      if (parsed.version !== 1 || !Array.isArray(parsed.projects)) {
        throw new Error("invalid drop hunter product store format");
      }
      return { version: 1, projects: clone(parsed.projects) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, projects: [] };
      throw error;
    }
  }

  private async writeSnapshot(snapshot: DropHunterProductSnapshot): Promise<void> {
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

export interface UpsertProjectInput {
  opportunity: ScoredOpportunity;
  tasks?: readonly DropTask[];
  intelligence?: DropOpportunityScore;
  timestamp?: string;
}

export interface TaskStatusDetails {
  error?: string;
  txHash?: string;
  contractAddress?: string;
  blockNumber?: number;
}

export class DropHunterProjectRepository {
  constructor(
    private readonly store: DropHunterProductStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async upsert(input: UpsertProjectInput): Promise<DropHunterProjectRecord> {
    const timestamp = input.timestamp ?? this.now().toISOString();
    const existing = await this.store.getProject(input.opportunity.id);
    const existingTasks = new Map((existing?.tasks ?? []).map((task) => [task.id, task]));
    const tasks = (input.tasks ?? existing?.tasks ?? []).map((task) => {
      const previous = existingTasks.get(task.id);
      if (previous) return { ...previous, ...clone(task), status: previous.status, createdAt: previous.createdAt, updatedAt: timestamp };
      return {
        ...clone(task),
        status: "pending" as const,
        createdAt: timestamp,
        updatedAt: timestamp,
        attempts: 0,
      };
    });

    const record: DropHunterProjectRecord = {
      id: input.opportunity.id,
      opportunity: clone(input.opportunity),
      intelligence: input.intelligence ? clone(input.intelligence) : existing?.intelligence,
      status: existing?.status ?? "new",
      firstSeenAt: existing?.firstSeenAt ?? timestamp,
      lastSeenAt: timestamp,
      updatedAt: timestamp,
      tasks,
      tags: existing?.tags ?? [],
      notes: existing?.notes,
    };
    await this.store.putProject(record);
    return clone(record);
  }

  async setProjectStatus(id: string, status: DropHunterProjectStatus): Promise<DropHunterProjectRecord> {
    const project = await this.requireProject(id);
    project.status = status;
    project.updatedAt = this.now().toISOString();
    await this.store.putProject(project);
    return clone(project);
  }

  async setTaskStatus(
    projectId: string,
    taskId: string,
    status: DropHunterTaskStatus,
    details: TaskStatusDetails = {},
  ): Promise<StoredDropTask> {
    const project = await this.requireProject(projectId);
    const task = project.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error(`drop hunter task not found: ${taskId}`);
    const timestamp = this.now().toISOString();
    task.status = status;
    task.updatedAt = timestamp;
    if (status === "running") task.attempts += 1;
    if (status === "completed") task.completedAt = timestamp;
    if (details.error !== undefined) task.lastError = details.error;
    if (details.txHash) task.txHashes = [...new Set([...(task.txHashes ?? []), details.txHash])];
    if (details.contractAddress) task.contractAddresses = [...new Set([...(task.contractAddresses ?? []), details.contractAddress])];
    if (details.blockNumber !== undefined) task.lastBlockNumber = details.blockNumber;
    project.updatedAt = timestamp;
    await this.store.putProject(project);
    return clone(task);
  }

  async listByStatus(status: DropHunterProjectStatus): Promise<DropHunterProjectRecord[]> {
    return (await this.store.listProjects()).filter((project) => project.status === status);
  }

  private async requireProject(id: string): Promise<DropHunterProjectRecord> {
    const project = await this.store.getProject(id);
    if (!project) throw new Error(`drop hunter project not found: ${id}`);
    return project;
  }
}
