import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ExecutionStatus } from "./execution-memory.js";

export type ExecutionReceiptStatus = "pending" | "submitted" | "confirmed" | "failed" | "unknown";

export interface ExecutionIntent {
  opportunityId: string;
  actionId: string;
  chainId?: number;
  account?: string;
  payloadFingerprint?: string;
}

export interface ExecutionReceipt {
  idempotencyKey: string;
  opportunityId: string;
  actionId: string;
  status: ExecutionReceiptStatus;
  createdAt: string;
  updatedAt: string;
  chainId?: number;
  account?: string;
  txHash?: string;
  note?: string;
}

export interface ReceiptReservation {
  reserved: boolean;
  receipt: ExecutionReceipt;
  reason: "new" | "already-pending" | "already-submitted" | "already-confirmed" | "already-unknown" | "retryable-failure";
}

export interface ExecutionReceiptPersistence {
  load(): ExecutionReceipt[];
  save(receipts: ExecutionReceipt[]): void;
}

interface ExecutionReceiptDocument {
  version: 1;
  receipts: ExecutionReceipt[];
}

const normalize = (v: string | undefined) => (v ?? "").trim().toLowerCase();

export function createIdempotencyKey(i: ExecutionIntent) {
  return createHash("sha256")
    .update(
      [
        normalize(i.opportunityId),
        normalize(i.actionId),
        i.chainId === undefined ? "" : String(i.chainId),
        normalize(i.account),
        normalize(i.payloadFingerprint),
      ].join("|"),
      "utf8",
    )
    .digest("hex");
}

const clone = (r: ExecutionReceipt) => ({ ...r });

function reservationReason(s: ExecutionReceiptStatus): ReceiptReservation["reason"] {
  switch (s) {
    case "pending":
      return "already-pending";
    case "submitted":
      return "already-submitted";
    case "confirmed":
      return "already-confirmed";
    case "unknown":
      return "already-unknown";
    case "failed":
      return "retryable-failure";
  }
}

function isReceipt(value: unknown): value is ExecutionReceipt {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Partial<ExecutionReceipt>;
  return (
    typeof receipt.idempotencyKey === "string" &&
    typeof receipt.opportunityId === "string" &&
    typeof receipt.actionId === "string" &&
    ["pending", "submitted", "confirmed", "failed", "unknown"].includes(receipt.status ?? "") &&
    typeof receipt.createdAt === "string" &&
    typeof receipt.updatedAt === "string" &&
    (receipt.chainId === undefined || typeof receipt.chainId === "number") &&
    (receipt.account === undefined || typeof receipt.account === "string") &&
    (receipt.txHash === undefined || typeof receipt.txHash === "string") &&
    (receipt.note === undefined || typeof receipt.note === "string")
  );
}

export class JsonExecutionReceiptPersistence implements ExecutionReceiptPersistence {
  readonly filePath: string;

  constructor(filePath: string) {
    const normalized = filePath.trim();
    if (!normalized) throw new Error("execution receipt persistence path cannot be empty");
    this.filePath = resolve(normalized);
  }

  load(): ExecutionReceipt[] {
    if (!existsSync(this.filePath)) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.filePath, "utf8"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`failed to parse execution receipt store ${this.filePath}: ${message}`);
    }

    if (!parsed || typeof parsed !== "object") {
      throw new Error(`invalid execution receipt store ${this.filePath}: expected an object`);
    }

    const document = parsed as Partial<ExecutionReceiptDocument>;
    if (document.version !== 1 || !Array.isArray(document.receipts)) {
      throw new Error(`invalid execution receipt store ${this.filePath}: expected version 1 document`);
    }

    for (const receipt of document.receipts) {
      if (!isReceipt(receipt)) {
        throw new Error(`invalid execution receipt store ${this.filePath}: malformed receipt`);
      }
    }

    return document.receipts.map(clone);
  }

  save(receipts: ExecutionReceipt[]): void {
    const directory = dirname(this.filePath);
    mkdirSync(directory, { recursive: true });

    const document: ExecutionReceiptDocument = {
      version: 1,
      receipts: receipts.map(clone),
    };
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;

    writeFileSync(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    try {
      renameSync(temporaryPath, this.filePath);
    } catch (error) {
      try {
        writeFileSync(this.filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
      } finally {
        try {
          readFileSync(temporaryPath);
        } catch {
          return;
        }
      }
      throw error;
    }
  }
}

export class ExecutionReceiptStore {
  private readonly receipts = new Map<string, ExecutionReceipt>();
  private readonly persistence?: ExecutionReceiptPersistence;

  constructor(persistence?: ExecutionReceiptPersistence) {
    this.persistence = persistence;
    if (persistence) this.replaceAll(persistence.load());
  }

  reserve(i: ExecutionIntent, t: string) {
    const k = createIdempotencyKey(i);
    const e = this.receipts.get(k);
    if (e && e.status !== "failed") return { reserved: false, receipt: clone(e), reason: reservationReason(e.status) };

    const r = {
      idempotencyKey: k,
      opportunityId: i.opportunityId,
      actionId: i.actionId,
      status: "pending" as const,
      createdAt: e?.createdAt ?? t,
      updatedAt: t,
      chainId: i.chainId,
      account: i.account,
    };
    this.receipts.set(k, r);
    this.persist();
    return { reserved: true, receipt: clone(r), reason: e ? "retryable-failure" as const : "new" as const };
  }

  markSubmitted(k: string, t: string, txHash: string, n?: string) {
    return this.update(k, { status: "submitted", updatedAt: t, txHash, note: n });
  }

  markConfirmed(k: string, t: string, txHash?: string, n?: string) {
    return this.update(k, { status: "confirmed", updatedAt: t, txHash, note: n });
  }

  markFailed(k: string, t: string, n?: string) {
    return this.update(k, { status: "failed", updatedAt: t, note: n });
  }

  markUnknown(k: string, t: string, n?: string) {
    return this.update(k, { status: "unknown", updatedAt: t, note: n });
  }

  get(k: string) {
    const r = this.receipts.get(k);
    return r ? clone(r) : undefined;
  }

  find(i: ExecutionIntent) {
    return this.get(createIdempotencyKey(i));
  }

  list() {
    return [...this.receipts.values()].map(clone);
  }

  reconcile(k: string, s: "confirmed" | "failed" | "unknown", t: string, o: { txHash?: string; note?: string } = {}) {
    return this.update(k, { status: s, updatedAt: t, txHash: o.txHash, note: o.note });
  }

  protected replaceAll(rs: ExecutionReceipt[]) {
    this.receipts.clear();
    for (const r of rs) this.receipts.set(r.idempotencyKey, clone(r));
  }

  protected update(k: string, patch: Partial<ExecutionReceipt> & Pick<ExecutionReceipt, "status" | "updatedAt">) {
    const c = this.receipts.get(k);
    if (!c) throw new Error(`Unknown execution receipt: ${k}`);
    const n = { ...c, ...patch };
    this.receipts.set(k, n);
    this.persist();
    return clone(n);
  }

  private persist() {
    this.persistence?.save(this.list());
  }
}

export function receiptStatusFromExecution(status: ExecutionStatus, txHash?: string): ExecutionReceiptStatus {
  if (txHash) return "submitted";
  if (status === "failed" || status === "skipped") return "failed";
  return "confirmed";
}
