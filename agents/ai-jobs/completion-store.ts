import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CompletionAttestation } from "./completion-attestation.js";

export interface CompletionPublicationRecord {
  jobId: string;
  transactionId: string;
  publishedAt: string;
  attestation?: CompletionAttestation;
}

export interface CompletionPublicationStore {
  get(jobId: string): CompletionPublicationRecord | undefined;
  set(record: CompletionPublicationRecord): void;
}

function validateRecord(record: CompletionPublicationRecord): void {
  if (!record.jobId.trim()) throw new Error("jobId is required");
  if (!record.transactionId.trim()) throw new Error("transactionId is required");
  if (!record.publishedAt.trim()) throw new Error("publishedAt is required");
}

export class MemoryCompletionPublicationStore implements CompletionPublicationStore {
  private readonly records = new Map<string, CompletionPublicationRecord>();

  get(jobId: string): CompletionPublicationRecord | undefined {
    return this.records.get(jobId);
  }

  set(record: CompletionPublicationRecord): void {
    validateRecord(record);
    const existing = this.records.get(record.jobId);
    if (existing && existing.transactionId !== record.transactionId) {
      throw new Error(`completion ${record.jobId} is already published as ${existing.transactionId}`);
    }
    this.records.set(record.jobId, record);
  }
}

export class JsonCompletionPublicationStore implements CompletionPublicationStore {
  private readonly records = new Map<string, CompletionPublicationRecord>();

  constructor(private readonly filePath: string) {
    this.load();
  }

  get(jobId: string): CompletionPublicationRecord | undefined {
    return this.records.get(jobId);
  }

  set(record: CompletionPublicationRecord): void {
    validateRecord(record);

    const existing = this.records.get(record.jobId);
    if (existing && existing.transactionId !== record.transactionId) {
      throw new Error(`completion ${record.jobId} is already published as ${existing.transactionId}`);
    }

    this.records.set(record.jobId, record);
    this.persist();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    const raw = readFileSync(this.filePath, "utf8").trim();
    if (!raw) return;

    const records = JSON.parse(raw) as CompletionPublicationRecord[];
    if (!Array.isArray(records)) throw new Error("invalid completion publication store");

    for (const record of records) {
      validateRecord(record);
      if (record.attestation !== undefined) {
        if (!record.attestation.jobId || !record.attestation.signature || !record.attestation.signer) {
          throw new Error("invalid completion attestation in publication record");
        }
      }
      this.records.set(record.jobId, record);
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(
      this.filePath,
      `${JSON.stringify([...this.records.values()], null, 2)}\n`,
      "utf8",
    );
  }
}
