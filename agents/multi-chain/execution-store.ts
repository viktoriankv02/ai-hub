import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { MultiChainExecutionPlan } from "./execution-planner.js";
import type { ExecutionPlanRunRecord } from "./execution-plan-runner.js";

export interface PersistedExecutionState {
  planId: string;
  plan: MultiChainExecutionPlan;
  records: ExecutionPlanRunRecord[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ExecutionPlanStore {
  get(planId: string): Promise<PersistedExecutionState | undefined>;
  put(state: PersistedExecutionState): Promise<void>;
  delete(planId: string): Promise<boolean>;
  list(): Promise<PersistedExecutionState[]>;
}

function cloneState(state: PersistedExecutionState): PersistedExecutionState {
  return JSON.parse(JSON.stringify(state)) as PersistedExecutionState;
}

export class MemoryExecutionPlanStore implements ExecutionPlanStore {
  private readonly states = new Map<string, PersistedExecutionState>();

  async get(planId: string): Promise<PersistedExecutionState | undefined> {
    const state = this.states.get(planId);
    return state ? cloneState(state) : undefined;
  }

  async put(state: PersistedExecutionState): Promise<void> {
    this.states.set(state.planId, cloneState(state));
  }

  async delete(planId: string): Promise<boolean> {
    return this.states.delete(planId);
  }

  async list(): Promise<PersistedExecutionState[]> {
    return [...this.states.values()].map(cloneState);
  }
}

interface JsonExecutionStoreFile {
  version: 1;
  states: Record<string, PersistedExecutionState>;
}

export class JsonFileExecutionPlanStore implements ExecutionPlanStore {
  constructor(private readonly filePath: string) {
    if (!filePath.trim()) throw new Error("execution store file path cannot be empty");
  }

  async get(planId: string): Promise<PersistedExecutionState | undefined> {
    const file = await this.readStore();
    const state = file.states[planId];
    return state ? cloneState(state) : undefined;
  }

  async put(state: PersistedExecutionState): Promise<void> {
    const file = await this.readStore();
    file.states[state.planId] = cloneState(state);
    await this.writeStore(file);
  }

  async delete(planId: string): Promise<boolean> {
    const file = await this.readStore();
    if (!file.states[planId]) return false;
    delete file.states[planId];
    await this.writeStore(file);
    return true;
  }

  async list(): Promise<PersistedExecutionState[]> {
    const file = await this.readStore();
    return Object.values(file.states).map(cloneState);
  }

  private async readStore(): Promise<JsonExecutionStoreFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as JsonExecutionStoreFile;
      if (parsed.version !== 1 || typeof parsed.states !== "object" || parsed.states === null) {
        throw new Error("invalid execution store format");
      }
      return parsed;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { version: 1, states: {} };
      throw error;
    }
  }

  private async writeStore(file: JsonExecutionStoreFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    await rename(tempPath, this.filePath);
  }
}
