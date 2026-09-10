import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { UniversalExecutionResult } from "./types.js";

export type ExecutionLedgerStatus =
  | "reserved"
  | "submitted"
  | "confirmed"
  | "failed"
  | "unknown";

export interface ExecutionLedgerEntry {
  key: string;
  actionId: string;
  chainKey: string;
  status: ExecutionLedgerStatus;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  txHash?: string;
  executionId?: string;
  note?: string;
}

export interface ExecutionLedgerSnapshot {
  version: 1;
  entries: ExecutionLedgerEntry[];
}

export interface ExecutionLedgerStore {
  get(key: string): Promise<ExecutionLedgerEntry | undefined>;
  list(): Promise<ExecutionLedgerEntry[]>;
  put(entry: ExecutionLedgerEntry): Promise<void>;
  delete(key: string): Promise<boolean>;
}

const cloneEntry = (entry: ExecutionLedgerEntry): ExecutionLedgerEntry => ({ ...entry });

export class MemoryExecutionLedgerStore implements ExecutionLedgerStore {
  private readonly entries = new Map<string, ExecutionLedgerEntry>();

  async get(key: string): Promise<ExecutionLedgerEntry | undefined> {
    const entry = this.entries.get(key);
    return entry ? cloneEntry(entry) : undefined;
  }

  async list(): Promise<ExecutionLedgerEntry[]> {
    return [...this.entries.values()].map(cloneEntry);
  }

  async put(entry: ExecutionLedgerEntry): Promise<void> {
    this.entries.set(entry.key, cloneEntry(entry));
  }

  async delete(key: string): Promise<boolean> {
    return this.entries.delete(key);
  }
}

export class JsonFileExecutionLedgerStore implements ExecutionLedgerStore {
  readonly filePath: string;

  constructor(filePath: string) {
    if (!filePath.trim()) throw new Error("execution ledger path cannot be empty");
    this.filePath = resolve(filePath);
  }

  async get(key: string): Promise<ExecutionLedgerEntry | undefined> {
    const snapshot = await this.readSnapshot();
    const entry = snapshot.entries.find((candidate) => candidate.key === key);
    return entry ? cloneEntry(entry) : undefined;
  }

  async list(): Promise<ExecutionLedgerEntry[]> {
    return (await this.readSnapshot()).entries.map(cloneEntry);
  }

  async put(entry: ExecutionLedgerEntry): Promise<void> {
    const snapshot = await this.readSnapshot();
    const next = snapshot.entries.filter((candidate) => candidate.key !== entry.key);
    next.push(cloneEntry(entry));
    await this.writeSnapshot({ version: 1, entries: next });
  }

  async delete(key: string): Promise<boolean> {
    const snapshot = await this.readSnapshot();
    const next = snapshot.entries.filter((candidate) => candidate.key !== key);
    if (next.length === snapshot.entries.length) return false;
    await this.writeSnapshot({ version: 1, entries: next });
    return true;
  }

  private async readSnapshot(): Promise<ExecutionLedgerSnapshot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<ExecutionLedgerSnapshot>;
      if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
        throw new Error("expected version 1 execution ledger");
      }
      return { version: 1, entries: parsed.entries.map((entry) => ({ ...entry })) };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { version: 1, entries: [] };
      throw error;
    }
  }

  private async writeSnapshot(snapshot: ExecutionLedgerSnapshot): Promise<void> {
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

export interface ExecutionReservation {
  reserved: boolean;
  entry: ExecutionLedgerEntry;
  reason: "new" | "retry" | "in-flight" | "already-confirmed" | "needs-recovery";
}

export class DurableExecutionLedger {
  constructor(
    private readonly store: ExecutionLedgerStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reserve(key: string, actionId: string, chainKey: string): Promise<ExecutionReservation> {
    if (!key.trim()) throw new Error("idempotency key cannot be empty");
    const existing = await this.store.get(key);
    const timestamp = this.now().toISOString();

    if (existing) {
      if (existing.status === "confirmed") {
        return { reserved: false, entry: existing, reason: "already-confirmed" };
      }
      if (existing.status === "reserved" || existing.status === "submitted") {
        return { reserved: false, entry: existing, reason: "in-flight" };
      }
      if (existing.status === "unknown") {
        return { reserved: false, entry: existing, reason: "needs-recovery" };
      }

      const retry: ExecutionLedgerEntry = {
        ...existing,
        status: "reserved",
        updatedAt: timestamp,
        attempts: existing.attempts + 1,
        txHash: undefined,
        executionId: undefined,
        note: undefined,
      };
      await this.store.put(retry);
      return { reserved: true, entry: retry, reason: "retry" };
    }

    const entry: ExecutionLedgerEntry = {
      key,
      actionId,
      chainKey,
      status: "reserved",
      createdAt: timestamp,
      updatedAt: timestamp,
      attempts: 1,
    };
    await this.store.put(entry);
    return { reserved: true, entry, reason: "new" };
  }

  async recordResult(key: string, result: UniversalExecutionResult): Promise<ExecutionLedgerEntry> {
    const current = await this.require(key);
    const status: ExecutionLedgerStatus = result.status === "success"
      ? result.txHash ? "submitted" : "confirmed"
      : result.status === "failed"
        ? "failed"
        : "unknown";

    const next: ExecutionLedgerEntry = {
      ...current,
      status,
      updatedAt: result.timestamp,
      txHash: result.txHash,
      executionId: result.executionId,
      note: result.note,
    };
    await this.store.put(next);
    return cloneEntry(next);
  }

  async markConfirmed(key: string, timestamp: string, note?: string): Promise<ExecutionLedgerEntry> {
    const current = await this.require(key);
    const next = { ...current, status: "confirmed" as const, updatedAt: timestamp, note };
    await this.store.put(next);
    return cloneEntry(next);
  }

  async markFailed(key: string, timestamp: string, note?: string): Promise<ExecutionLedgerEntry> {
    const current = await this.require(key);
    const next = { ...current, status: "failed" as const, updatedAt: timestamp, note };
    await this.store.put(next);
    return cloneEntry(next);
  }

  async markUnknown(key: string, timestamp: string, note?: string): Promise<ExecutionLedgerEntry> {
    const current = await this.require(key);
    const next = { ...current, status: "unknown" as const, updatedAt: timestamp, note };
    await this.store.put(next);
    return cloneEntry(next);
  }

  async get(key: string): Promise<ExecutionLedgerEntry | undefined> {
    return this.store.get(key);
  }

  async list(): Promise<ExecutionLedgerEntry[]> {
    return this.store.list();
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  private async require(key: string): Promise<ExecutionLedgerEntry> {
    const entry = await this.store.get(key);
    if (!entry) throw new Error(`execution ledger entry not found: ${key}`);
    return entry;
  }
}
