import { mkdirSync, readFileSync, renameSync, existsSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CompletionAttestation } from "./completion-attestation.js";

export interface CompletionPublication {
  jobId: string;
  transactionId: string;
  publishedAt: string;
  attestation?: CompletionAttestation;
}

export interface CompletionPublicationStore {
  get(jobId: string): CompletionPublication | undefined;
  set(publication: CompletionPublication): void;
}

interface PersistedCompletionPublications {
  version: 1;
  publications: CompletionPublication[];
}

export class MemoryCompletionPublicationStore implements CompletionPublicationStore {
  private readonly publications = new Map<string, CompletionPublication>();

  get(jobId: string): CompletionPublication | undefined {
    return this.publications.get(jobId);
  }

  set(publication: CompletionPublication): void {
    if (!publication.jobId.trim()) throw new Error("publication jobId is required");
    if (!publication.transactionId.trim()) throw new Error("publication transactionId is required");
    this.publications.set(publication.jobId, publication);
  }
}

export class JsonCompletionPublicationStore implements CompletionPublicationStore {
  private readonly filePath: string;
  private readonly publications = new Map<string, CompletionPublication>();

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
    this.load();
  }

  get(jobId: string): CompletionPublication | undefined {
    return this.publications.get(jobId);
  }

  set(publication: CompletionPublication): void {
    if (!publication.jobId.trim()) throw new Error("publication jobId is required");
    if (!publication.transactionId.trim()) throw new Error("publication transactionId is required");
    this.publications.set(publication.jobId, publication);
    this.save();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.filePath, "utf8"));
    } catch (error) {
      throw new Error(`invalid completion publication store JSON: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!parsed || typeof parsed !== "object") throw new Error("invalid completion publication store document");
    const document = parsed as Partial<PersistedCompletionPublications>;
    if (document.version !== 1 || !Array.isArray(document.publications)) {
      throw new Error("unsupported completion publication store schema");
    }

    for (const publication of document.publications) {
      if (!publication || typeof publication !== "object") throw new Error("invalid completion publication entry");
      const value = publication as CompletionPublication;
      if (!value.jobId?.trim() || !value.transactionId?.trim() || !value.publishedAt?.trim()) {
        throw new Error("invalid completion publication entry");
      }
      this.publications.set(value.jobId, value);
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    const document: PersistedCompletionPublications = {
      version: 1,
      publications: [...this.publications.values()],
    };
    writeFileSync(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

    try {
      renameSync(temporaryPath, this.filePath);
    } catch {
      if (!existsSync(this.filePath)) throw new Error("failed to persist completion publication store");
      unlinkSync(this.filePath);
      renameSync(temporaryPath, this.filePath);
    }
  }
}
