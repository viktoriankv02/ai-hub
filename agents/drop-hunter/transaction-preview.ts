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

/**
 * Creates a cryptographically strong, deterministic fingerprint for a preview payload.
 * The hash is an identity marker for the exact preview contents; it is not a signature.
 */
export function createTransactionPreviewHash(value: string): string {
  return `preview:${createHash("sha256").update(value, "utf8").digest("hex")}`;
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

    const previewPayload = JSON.stringify({
      actionId: action.id,
      label: action.label,
      risk: action.risk,
      chainId: context.chainId,
      calls,
    });

    return {
      actionId: action.id,
      label: action.label,
      risk: action.risk,
      requiresWallet: action.requiresWallet,
      requiresGas: action.requiresGas,
      chainId: context.chainId,
      calls,
      warnings,
      previewHash: createTransactionPreviewHash(previewPayload),
    };
  }
}
