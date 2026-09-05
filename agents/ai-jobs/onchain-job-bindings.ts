import { dirname, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

export interface OnchainJobBindingStore {
  get(offchainJobId: string): bigint | undefined;
  set(offchainJobId: string, onchainJobId: bigint): void;
}

export class MemoryOnchainJobBindingStore implements OnchainJobBindingStore {
  private readonly bindings = new Map<string, bigint>();

  get(offchainJobId: string): bigint | undefined {
    return this.bindings.get(offchainJobId);
  }

  set(offchainJobId: string, onchainJobId: bigint): void {
    if (!offchainJobId.trim()) throw new Error("offchainJobId is required");
    if (onchainJobId < 1n) throw new Error("onchainJobId must be positive");
    this.bindings.set(offchainJobId, onchainJobId);
  }
}

interface PersistedBindings {
  version: 1;
  bindings: Array<{ offchainJobId: string; onchainJobId: string }>;
}

export class JsonOnchainJobBindingStore implements OnchainJobBindingStore {
  private readonly filePath: string;
  private readonly bindings = new Map<string, bigint>();

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
    this.load();
  }

  get(offchainJobId: string): bigint | undefined {
    return this.bindings.get(offchainJobId);
  }

  set(offchainJobId: string, onchainJobId: bigint): void {
    if (!offchainJobId.trim()) throw new Error("offchainJobId is required");
    if (onchainJobId < 1n) throw new Error("onchainJobId must be positive");
    this.bindings.set(offchainJobId, onchainJobId);
    this.save();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.filePath, "utf8"));
    } catch (error) {
      throw new Error(`invalid onchain job binding store JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!parsed || typeof parsed !== "object") throw new Error("invalid onchain job binding store document");
    const document = parsed as Partial<PersistedBindings>;
    if (document.version !== 1 || !Array.isArray(document.bindings)) {
      throw new Error("unsupported onchain job binding store schema");
    }
    for (const binding of document.bindings) {
      if (!binding || typeof binding !== "object" || typeof binding.offchainJobId !== "string" || typeof binding.onchainJobId !== "string") {
        throw new Error("invalid onchain job binding entry");
      }
      const onchainJobId = BigInt(binding.onchainJobId);
      if (onchainJobId < 1n) throw new Error("onchainJobId must be positive");
      this.bindings.set(binding.offchainJobId, onchainJobId);
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    const document: PersistedBindings = {
      version: 1,
      bindings: [...this.bindings.entries()].map(([offchainJobId, onchainJobId]) => ({
        offchainJobId,
        onchainJobId: onchainJobId.toString(),
      })),
    };
    writeFileSync(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    try {
      renameSync(temporaryPath, this.filePath);
    } catch {
      if (!existsSync(this.filePath)) throw new Error("failed to persist onchain job binding store");
      unlinkSync(this.filePath);
      renameSync(temporaryPath, this.filePath);
    }
  }
}
