import { createHash } from "node:crypto";
import type { ExecutionRisk, PlannedAction } from "./action-planner.js";

export interface TransactionCall {
  to: string;
  data?: string;
  value?: string;
  chainId?: number;
}

export interface TransactionPreview {
  actionId: string;
  label: string;
  risk: ExecutionRisk;
  requiresWallet: boolean;
  requiresGas: boolean;
  chainId?: number;
  calls: TransactionCall[];
  estimatedGas?: string;
  estimatedValue?: string;
  warnings: string[];
  previewHash: string;
}

export interface TransactionPreviewBuilder {
  build(action: PlannedAction, context: { chainId?: number }): TransactionPreview;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "previewHash" && value !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

/**
 * Creates a cryptographically strong, deterministic fingerprint for preview data.
 * previewHash itself is excluded so callers can recompute the fingerprint before signing.
 */
export function createTransactionPreviewHash(value: string): string {
  return `preview:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function fingerprintTransactionPreview(preview: Omit<TransactionPreview, "previewHash"> | TransactionPreview): string {
  return createTransactionPreviewHash(JSON.stringify(canonicalize(preview)));
}

export class StaticTransactionPreviewBuilder implements TransactionPreviewBuilder {
  build(action: PlannedAction, context: { chainId?: number }): TransactionPreview {
    const calls: TransactionCall[] = [];
    const warnings: string[] = [];

    if (action.requiresWallet && action.requiresGas) {
      warnings.push("Transaction details must be supplied by a trusted action adapter before signing.");
    }
    if (action.risk !== "low") {
      warnings.push(`Action risk is ${action.risk}; explicit user approval is required before execution.`);
    }
    if (!action.requiresWallet) {
      warnings.push("This action does not require a wallet transaction.");
    }

    const preview = {
      actionId: action.id,
      label: action.label,
      risk: action.risk,
      requiresWallet: action.requiresWallet,
      requiresGas: action.requiresGas,
      chainId: context.chainId,
      calls,
      warnings,
    };

    return {
      ...preview,
      previewHash: fingerprintTransactionPreview(preview),
    };
  }
}
