import { createHash } from "node:crypto";

export type DropHunterRewardStatus = "detected" | "claimable" | "claimed" | "confirmed" | "dismissed";
export type DropHunterRewardSource = "onchain" | "campaign" | "manual" | "unknown";

export interface DropHunterRewardRecord {
  id: string;
  projectId: string;
  taskId?: string;
  chainId?: number;
  status: DropHunterRewardStatus;
  source: DropHunterRewardSource;
  assetSymbol?: string;
  assetAddress?: string;
  amount?: string;
  estimatedUsd?: number;
  confidence: number;
  reference?: string;
  note?: string;
  detectedAt: string;
  updatedAt: string;
}

export interface CreateRewardRecordInput extends Omit<DropHunterRewardRecord, "id" | "detectedAt" | "updatedAt" | "confidence"> {
  id?: string;
  detectedAt?: string;
  updatedAt?: string;
  confidence?: number;
}

export function createRewardRecord(input: CreateRewardRecordInput): DropHunterRewardRecord {
  if (!input.projectId.trim()) throw new Error("reward projectId cannot be empty");
  if (input.chainId !== undefined && (!Number.isInteger(input.chainId) || input.chainId <= 0)) throw new Error("reward chainId must be a positive integer");
  if (input.estimatedUsd !== undefined && (!Number.isFinite(input.estimatedUsd) || input.estimatedUsd < 0)) throw new Error("reward estimatedUsd must be non-negative");
  const confidence = input.confidence ?? 0.5;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("reward confidence must be between 0 and 1");
  const now = input.updatedAt ?? input.detectedAt ?? new Date().toISOString();
  return {
    ...input,
    id: input.id ?? rewardFingerprint(input),
    confidence,
    detectedAt: input.detectedAt ?? now,
    updatedAt: now,
  };
}

export function rewardFingerprint(input: Pick<CreateRewardRecordInput, "projectId" | "taskId" | "chainId" | "assetAddress" | "assetSymbol" | "amount" | "reference">): string {
  const normalized = [
    input.projectId.trim().toLowerCase(),
    input.taskId?.trim().toLowerCase() ?? "",
    String(input.chainId ?? ""),
    input.assetAddress?.trim().toLowerCase() ?? "",
    input.assetSymbol?.trim().toUpperCase() ?? "",
    input.amount?.trim() ?? "",
    input.reference?.trim().toLowerCase() ?? "",
  ].join("|");
  return `reward:${createHash("sha256").update(normalized).digest("hex")}`;
}
