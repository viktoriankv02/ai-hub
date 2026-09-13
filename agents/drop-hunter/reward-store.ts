import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRewardRecord, type CreateRewardRecordInput, type DropHunterRewardRecord, type DropHunterRewardStatus } from "./reward-model.js";

export interface DropHunterRewardSnapshot {
  version: 1;
  rewards: DropHunterRewardRecord[];
}

export interface DropHunterRewardStore {
  get(id: string): Promise<DropHunterRewardRecord | undefined>;
  list(): Promise<DropHunterRewardRecord[]>;
  put(record: DropHunterRewardRecord): Promise<void>;
  delete(id: string): Promise<boolean>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class MemoryDropHunterRewardStore implements DropHunterRewardStore {
  private readonly rewards = new Map<string, DropHunterRewardRecord>();

  async get(id: string): Promise<DropHunterRewardRecord | undefined> {
    const reward = this.rewards.get(id);
    return reward ? clone(reward) : undefined;
  }

  async list(): Promise<DropHunterRewardRecord[]> {
    return [...this.rewards.values()].map(clone);
  }

  async put(record: DropHunterRewardRecord): Promise<void> {
    this.rewards.set(record.id, clone(record));
  }

  async delete(id: string): Promise<boolean> {
    return this.rewards.delete(id);
  }
}

export class JsonFileDropHunterRewardStore implements DropHunterRewardStore {
  readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    if (!filePath.trim()) throw new Error("drop hunter reward store path cannot be empty");
    this.filePath = resolve(filePath);
  }

  async get(id: string): Promise<DropHunterRewardRecord | undefined> {
    await this.writeQueue;
    const reward = (await this.readSnapshot()).rewards.find((item) => item.id === id);
    return reward ? clone(reward) : undefined;
  }

  async list(): Promise<DropHunterRewardRecord[]> {
    await this.writeQueue;
    return (await this.readSnapshot()).rewards.map(clone);
  }

  async put(record: DropHunterRewardRecord): Promise<void> {
    await this.enqueue(async () => {
      const snapshot = await this.readSnapshot();
      const rewards = snapshot.rewards.filter((item) => item.id !== record.id);
      rewards.push(clone(record));
      rewards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
      await this.writeSnapshot({ version: 1, rewards });
    });
  }

  async delete(id: string): Promise<boolean> {
    let deleted = false;
    await this.enqueue(async () => {
      const snapshot = await this.readSnapshot();
      const rewards = snapshot.rewards.filter((item) => item.id !== id);
      deleted = rewards.length !== snapshot.rewards.length;
      if (deleted) await this.writeSnapshot({ version: 1, rewards });
    });
    return deleted;
  }

  private async enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(operation, operation);
    this.writeQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private async readSnapshot(): Promise<DropHunterRewardSnapshot> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<DropHunterRewardSnapshot>;
      if (parsed.version !== 1 || !Array.isArray(parsed.rewards)) throw new Error("invalid drop hunter reward store format");
      return { version: 1, rewards: clone(parsed.rewards) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, rewards: [] };
      throw error;
    }
  }

  private async writeSnapshot(snapshot: DropHunterRewardSnapshot): Promise<void> {
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

export class DropHunterRewardRepository {
  constructor(
    private readonly store: DropHunterRewardStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async upsert(input: CreateRewardRecordInput): Promise<DropHunterRewardRecord> {
    const timestamp = this.now().toISOString();
    const incoming = createRewardRecord({ ...input, detectedAt: input.detectedAt ?? timestamp, updatedAt: timestamp });
    const existing = await this.store.get(incoming.id);
    const record = existing
      ? { ...existing, ...incoming, detectedAt: existing.detectedAt, updatedAt: timestamp }
      : incoming;
    await this.store.put(record);
    return clone(record);
  }

  async setStatus(id: string, status: DropHunterRewardStatus, note?: string): Promise<DropHunterRewardRecord> {
    const reward = await this.store.get(id);
    if (!reward) throw new Error(`drop hunter reward not found: ${id}`);
    reward.status = status;
    reward.updatedAt = this.now().toISOString();
    if (note !== undefined) reward.note = note;
    await this.store.put(reward);
    return clone(reward);
  }

  async listProject(projectId: string): Promise<DropHunterRewardRecord[]> {
    return (await this.store.list()).filter((reward) => reward.projectId === projectId);
  }
}
