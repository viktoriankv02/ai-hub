import { expect } from "chai";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ExecutionReceiptStore,
  JsonExecutionReceiptPersistence,
} from "../agents/drop-hunter/execution-idempotency.js";

const intent = {
  opportunityId: "opportunity-persisted",
  actionId: "register-chain",
  chainId: 84532,
  account: "0x0000000000000000000000000000000000000001",
  payloadFingerprint: "preview:persisted",
};

describe("ExecutionReceiptStore persistence", () => {
  let directory: string;
  let filePath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "ai-hub-receipts-"));
    filePath = join(directory, "receipts.json");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("starts empty when the persistence file does not exist", () => {
    const store = new ExecutionReceiptStore(new JsonExecutionReceiptPersistence(filePath));

    expect(store.list()).to.deep.equal([]);
  });

  it("restores a submitted receipt after a new store is created", () => {
    const persistence = new JsonExecutionReceiptPersistence(filePath);
    const first = new ExecutionReceiptStore(persistence);
    const reserved = first.reserve(intent, "2026-09-05T10:00:00.000Z");

    expect(reserved.reserved).to.equal(true);
    first.markSubmitted(reserved.receipt.idempotencyKey, "2026-09-05T10:00:01.000Z", "0xtx-persisted");

    const restarted = new ExecutionReceiptStore(new JsonExecutionReceiptPersistence(filePath));
    const restored = restarted.find(intent);

    expect(restored?.status).to.equal("submitted");
    expect(restored?.txHash).to.equal("0xtx-persisted");
    expect(restored?.txHashes).to.deep.equal(["0xtx-persisted"]);

    const repeat = restarted.reserve(intent, "2026-09-05T10:01:00.000Z");
    expect(repeat.reserved).to.equal(false);
    expect(repeat.reason).to.equal("already-submitted");
  });

  it("restores all submitted hashes for a batch", () => {
    const first = new ExecutionReceiptStore(new JsonExecutionReceiptPersistence(filePath));
    const reserved = first.reserve(intent, "2026-09-05T10:00:00.000Z");
    first.markSubmitted(
      reserved.receipt.idempotencyKey,
      "2026-09-05T10:00:01.000Z",
      "0xtx2",
      "batch submitted",
      ["0xtx1", "0xtx2"],
    );

    const restarted = new ExecutionReceiptStore(new JsonExecutionReceiptPersistence(filePath));
    const restored = restarted.find(intent);

    expect(restored?.status).to.equal("submitted");
    expect(restored?.txHash).to.equal("0xtx2");
    expect(restored?.txHashes).to.deep.equal(["0xtx1", "0xtx2"]);
  });

  it("persists a failed receipt as retryable state", () => {
    const first = new ExecutionReceiptStore(new JsonExecutionReceiptPersistence(filePath));
    const reserved = first.reserve(intent, "2026-09-05T10:00:00.000Z");
    first.markFailed(reserved.receipt.idempotencyKey, "2026-09-05T10:00:02.000Z", "RPC unavailable");

    const restarted = new ExecutionReceiptStore(new JsonExecutionReceiptPersistence(filePath));
    const retry = restarted.reserve(intent, "2026-09-05T10:00:03.000Z");

    expect(retry.reserved).to.equal(true);
    expect(retry.reason).to.equal("retryable-failure");
    expect(retry.receipt.status).to.equal("pending");
  });

  it("rejects malformed persisted JSON instead of silently resetting state", () => {
    const persistence = new JsonExecutionReceiptPersistence(filePath);
    mkdirSync(directory, { recursive: true });
    writeFileSync(filePath, "{not-json", "utf8");

    expect(() => new ExecutionReceiptStore(persistence)).to.throw(/failed to parse execution receipt store/);
  });

  it("rejects a valid JSON document with an unsupported schema version", () => {
    const persistence = new JsonExecutionReceiptPersistence(filePath);
    mkdirSync(directory, { recursive: true });
    writeFileSync(filePath, JSON.stringify({ version: 99, receipts: [] }), "utf8");

    expect(() => new ExecutionReceiptStore(persistence)).to.throw(/expected version 1 document/);
  });

  it("writes a versioned document and leaves no temporary file behind", () => {
    const store = new ExecutionReceiptStore(new JsonExecutionReceiptPersistence(filePath));
    store.reserve(intent, "2026-09-05T10:00:00.000Z");

    const document = JSON.parse(readFileSync(filePath, "utf8")) as { version: number; receipts: unknown[] };
    expect(document.version).to.equal(1);
    expect(document.receipts).to.have.length(1);
    expect(readdirSync(directory).filter((name) => name.endsWith(".tmp"))).to.deep.equal([]);
  });
});
