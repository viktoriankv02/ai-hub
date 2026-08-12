import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AIJobSchedulerState, AIJobSchedulerStateStore } from "./scheduler.js";

interface PersistedSchedulerState {
  version: 1;
  state: AIJobSchedulerState;
}

export class JsonFileAIJobSchedulerStateStore implements AIJobSchedulerStateStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<AIJobSchedulerState | undefined> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<PersistedSchedulerState>;
      if (parsed.version !== 1 || !parsed.state) {
        throw new Error("unsupported AI job scheduler state format");
      }
      return parsed.state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async save(state: AIJobSchedulerState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    const payload: PersistedSchedulerState = { version: 1, state: { ...state } };
    await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
  }
}
