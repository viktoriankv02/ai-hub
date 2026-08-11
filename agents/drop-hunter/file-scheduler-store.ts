import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { emptyDropHunterSchedulerState, type DropHunterSchedulerState, type DropHunterSchedulerStateStore } from "./scheduler-store.js";

export class FileDropHunterSchedulerStateStore implements DropHunterSchedulerStateStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<DropHunterSchedulerState | undefined> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      return validateState(parsed, this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async save(state: DropHunterSchedulerState): Promise<void> {
    const normalized = validateState(state, this.filePath);
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    await rename(temporary, this.filePath);
  }
}

function validateState(value: unknown, path: string): DropHunterSchedulerState {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error(`Invalid Drop Hunter scheduler state: ${path}`);
  }
  const numeric = ["totalTicks", "successfulTicks", "failedTicks", "consecutiveFailures"] as const;
  for (const key of numeric) {
    if (typeof value[key] !== "number" || !Number.isInteger(value[key]) || value[key] < 0) {
      throw new Error(`Invalid scheduler state field ${key}: ${path}`);
    }
  }
  for (const key of ["lastStartedAt", "lastCompletedAt", "lastErrorAt"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") {
      throw new Error(`Invalid scheduler state field ${key}: ${path}`);
    }
  }
  if (value.lastCycle !== undefined) {
    if (!isRecord(value.lastCycle) || typeof value.lastCycle.timestamp !== "string" ||
      !isNonNegativeInt(value.lastCycle.cycleCount) || !isNonNegativeInt(value.lastCycle.failedSourceCount)) {
      throw new Error(`Invalid scheduler state field lastCycle: ${path}`);
    }
  }
  return {
    ...emptyDropHunterSchedulerState(),
    ...value,
    lastCycle: value.lastCycle === undefined ? undefined : {
      timestamp: value.lastCycle.timestamp,
      cycleCount: value.lastCycle.cycleCount,
      failedSourceCount: value.lastCycle.failedSourceCount,
    },
  };
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
