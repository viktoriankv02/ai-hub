import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AIJobRecord, AIJobStore } from "./types.js";

interface StoreFile {
  version: 1;
  jobs: AIJobRecord[];
}

/**
 * Small durable store for local development and the first backend integration.
 * It intentionally has no locking or multi-process guarantees; production can
 * replace it with Postgres/SQLite while keeping the AIJobStore contract.
 */
export class JsonFileAIJobStore implements AIJobStore {
  private readonly jobs = new Map<string, AIJobRecord>();
  private readonly idempotency = new Map<string, string>();

  constructor(private readonly filePath: string) {
    this.load();
  }

  get(id: string): AIJobRecord | undefined {
    const job = this.jobs.get(id);
    return job ? clone(job) : undefined;
  }

  getByIdempotencyKey(key: string): AIJobRecord | undefined {
    const id = this.idempotency.get(key);
    return id ? this.get(id) : undefined;
  }

  save(job: AIJobRecord): void {
    const copy = clone(job);
    this.jobs.set(job.id, copy);
    this.idempotency.set(job.idempotencyKey, job.id);
    this.flush();
  }

  list(): AIJobRecord[] {
    return [...this.jobs.values()].map(clone);
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;

    const raw = readFileSync(this.filePath, "utf8").trim();
    if (!raw) return;

    const parsed = JSON.parse(raw) as StoreFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.jobs)) {
      throw new Error(`Unsupported AI job store format: ${this.filePath}`);
    }

    for (const job of parsed.jobs) {
      this.jobs.set(job.id, clone(job));
      this.idempotency.set(job.idempotencyKey, job.id);
    }
  }

  private flush(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const payload: StoreFile = {
      version: 1,
      jobs: this.list(),
    };
    writeFileSync(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
}

function clone(job: AIJobRecord): AIJobRecord {
  return {
    ...job,
    metadata: job.metadata ? { ...job.metadata } : undefined,
  };
}
