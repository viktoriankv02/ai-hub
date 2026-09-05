import type { PlannedAction } from "./action-planner.js";
import type { ExecutionAdapter, ExecutionAdapterContext } from "./execution-adapter.js";
import type { ExecutionHandlerResult } from "./execution-runner.js";
import type { TransactionCall, TransactionPreview, TransactionPreviewBuilder } from "./transaction-preview.js";
import { createTransactionPreviewHash, StaticTransactionPreviewBuilder } from "./transaction-preview.js";

export type EvmActionKind = "bridge" | "swap" | "stake" | "mint" | "deploy" | "custom";

export interface EvmActionTransactionSpec {
  actionId: string;
  kind: EvmActionKind;
  chainId: number;
  to: string;
  data?: string;
  value?: string;
  gasLimit?: string;
  description?: string;
}

export interface EvmActionAdapterOptions {
  id?: string;
  specs: Iterable<EvmActionTransactionSpec>;
  previewBuilder?: TransactionPreviewBuilder;
}

export interface EvmActionPreview extends TransactionPreview {
  kind: EvmActionKind;
  gasLimit?: string;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const DATA_RE = /^0x[0-9a-fA-F]*$/;
const QUANTITY_RE = /^(0|[1-9][0-9]*)$/;

function validateSpec(spec: EvmActionTransactionSpec): void {
  if (!spec.actionId.trim()) throw new Error("EVM action spec requires actionId");
  if (!Number.isInteger(spec.chainId) || spec.chainId <= 0) {
    throw new Error(`invalid EVM chainId for ${spec.actionId}: ${spec.chainId}`);
  }
  if (!ADDRESS_RE.test(spec.to)) {
    throw new Error(`invalid EVM target address for ${spec.actionId}: ${spec.to}`);
  }
  if (spec.data !== undefined && !DATA_RE.test(spec.data)) {
    throw new Error(`invalid EVM calldata for ${spec.actionId}`);
  }
  if (spec.value !== undefined && !QUANTITY_RE.test(spec.value)) {
    throw new Error(`invalid EVM transaction value for ${spec.actionId}`);
  }
  if (spec.gasLimit !== undefined && !QUANTITY_RE.test(spec.gasLimit)) {
    throw new Error(`invalid EVM gas limit for ${spec.actionId}`);
  }
}

/**
 * Trusted EVM action adapter.
 *
 * Natural-language Drop Hunter tasks are never converted directly into
 * transaction calldata. A trusted integration must register an explicit
 * transaction spec first. This keeps bridge/swap/stake/mint/deploy execution
 * deterministic and prevents an LLM or untrusted source from choosing an
 * arbitrary contract target.
 */
export class EvmActionAdapter implements ExecutionAdapter {
  readonly id: string;
  private readonly specs = new Map<string, EvmActionTransactionSpec>();
  private readonly previewBuilder: TransactionPreviewBuilder;

  constructor(options: EvmActionAdapterOptions) {
    this.id = options.id ?? "evm-action-adapter";
    this.previewBuilder = options.previewBuilder ?? new StaticTransactionPreviewBuilder();

    for (const spec of options.specs) {
      validateSpec(spec);
      if (this.specs.has(spec.actionId)) {
        throw new Error(`duplicate EVM action spec: ${spec.actionId}`);
      }
      this.specs.set(spec.actionId, { ...spec });
    }

    if (this.specs.size === 0) {
      throw new Error("EVM action adapter requires at least one transaction spec");
    }
  }

  supports(action: PlannedAction): boolean {
    return this.specs.has(action.id);
  }

  getSpec(actionId: string): EvmActionTransactionSpec | undefined {
    const spec = this.specs.get(actionId);
    return spec ? { ...spec } : undefined;
  }

  listSpecs(): EvmActionTransactionSpec[] {
    return [...this.specs.values()].map((spec) => ({ ...spec }));
  }

  buildPreview(action: PlannedAction, context: { chainId?: number }): EvmActionPreview {
    const spec = this.specs.get(action.id);
    if (!spec) throw new Error(`no EVM transaction spec registered for action: ${action.id}`);

    if (context.chainId !== undefined && context.chainId !== spec.chainId) {
      throw new Error(
        `EVM action ${action.id} targets chain ${spec.chainId}, but execution context is chain ${context.chainId}`,
      );
    }

    const base = this.previewBuilder.build(action, { chainId: spec.chainId });
    const call: TransactionCall = {
      to: spec.to,
      data: spec.data,
      value: spec.value,
      chainId: spec.chainId,
    };

    const warnings = [...base.warnings];
    if (spec.description) warnings.push(`Trusted action: ${spec.description}`);
    warnings.push(`Target chain is fixed to ${spec.chainId}.`);
    warnings.push(`Target contract is fixed to ${spec.to}.`);

    const previewPayload = JSON.stringify({
      ...base,
      calls: [call],
      gasLimit: spec.gasLimit,
      kind: spec.kind,
    });

    return {
      ...base,
      kind: spec.kind,
      calls: [call],
      warnings,
      previewHash: createTransactionPreviewHash(previewPayload),
      gasLimit: spec.gasLimit,
    };
  }

  async execute(
    action: PlannedAction,
    context: ExecutionAdapterContext,
  ): Promise<ExecutionHandlerResult> {
    if (context.mode === "dry-run") {
      return {
        status: "failed",
        timestamp: context.timestamp,
        chainId: context.chainId,
        note: "execution adapters are not invoked during dry-run",
      };
    }

    if (!this.supports(action)) {
      return {
        status: "failed",
        timestamp: context.timestamp,
        chainId: context.chainId,
        note: `EVM action adapter does not support action: ${action.id}`,
      };
    }

    const spec = this.specs.get(action.id)!;
    if (context.chainId !== spec.chainId) {
      return {
        status: "failed",
        timestamp: context.timestamp,
        chainId: context.chainId,
        note: `wallet is on chain ${context.chainId ?? "unknown"}; action requires chain ${spec.chainId}`,
      };
    }

    // This adapter deliberately stops at the exact transaction boundary.
    // Wallet signing belongs to WalletExecutionAdapter after explicit user approval.
    return {
      status: "failed",
      timestamp: context.timestamp,
      chainId: spec.chainId,
      note: "transaction preview is ready; execute it through the approved wallet execution boundary",
    };
  }
}
