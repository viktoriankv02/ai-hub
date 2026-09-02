import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface OnchainJobBindingStore {
  get(offchainJobId: string): bigint | undefined;
  set(offchainJobId: string, onchainJobId: bigint): void;
  has(offchainJobId: string): boolean;
}

export class MemoryOnchainJobBindingStore implements OnchainJobBindingStore {
  private readonly bindings = new Map<string, bigint>();

  get(offchainJobId: string): bigint | undefined {
    return this.bindings.get(offchainJobId);
  }

  set(offchainJobId: string, onchainJobId: bigint): void {
    if (!offchainJobId.trim()) throw new Error("offchainJobId is required");
    if (onchainJobId < 1n) throw new Error("onchainJobId must be positive");
    const existing = this.bindings.get(offchainJobId);
    if (existing !== undefined && existing !== onchainJobId) {
      throw new Error(`offchain job ${offchainJobId} is already bound to ${existing}`);
    }
    this.bindings.set(offchainJobId, onchainJobId);
  }

  has(offchainJobId: string): boolean {
    return this.bindings.has(offchainJobId);
  }
}

interface JsonBindingRecord {
  offchainJobId: string;
  onchainJobId: string;
}

export class JsonOnchainJobBindingStore implements OnchainJobBindingStore {
  private readonly bindings = new Map<string, bigint>();

  constructor(private readonly filePath: string) {
    this.load();
  }

  get(offchainJobId: string): bigint | undefined {
    return this.bindings.get(offchainJobId);
  }

  set(offchainJobId: string, onchainJobId: bigint): void {
    if (!offchainJobId.trim()) throw new Error("offchainJobId is required");
    if (onchainJobId < 1n) throw new Error("onchainJobId must be positive");

    const existing = this.bindings.get(offchainJobId);
    if (existing !== undefined && existing !== onchainJobId) {
      throw new Error(`offchain job ${offchainJobId} is already bound to ${existing}`);
    }

    this.bindings.set(offchainJobId, onchainJobId);
    this.persist();
  }

  has(offchainJobId: string): boolean {
    return this.bindings.has(offchainJobId);
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    const raw = readFileSync(this.filePath, "utf8").trim();
    if (!raw) return;

    const records = JSON.parse(raw) as JsonBindingRecord[];
    if (!Array.isArray(records)) throw new Error("invalid onchain job binding store");

    for (const record of records) {
      if (!record.offchainJobId || !record.onchainJobId) {
        throw new Error("invalid onchain job binding record");
      }
      this.bindings.set(record.offchainJobId, BigInt(record.onchainJobId));
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const records = [...this.bindings.entries()].map(([offchainJobId, onchainJobId]) => ({
      offchainJobId,
      onchainJobId: onchainJobId.toString(),
    }));
    writeFileSync(this.filePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  }
}
