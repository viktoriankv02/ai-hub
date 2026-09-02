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
