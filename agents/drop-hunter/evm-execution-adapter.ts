import type { PlannedAction } from "./action-planner.js";
import type {
  ExecutionAdapter,
  ExecutionAdapterContext,
} from "./execution-adapter.js";
import type { ExecutionHandlerResult } from "./execution-runner.js";

export interface EvmTransactionRequest {
  to?: string;
  data?: string;
  value?: bigint;
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
}

export interface EvmTransactionResponse {
  hash: string;
}

export interface EvmTransactionReceipt {
  status?: number | bigint | null;
  blockNumber?: number | null;
  transactionHash?: string;
}

/**
 * Minimal provider surface required by the adapter. It is intentionally
 * structural so the adapter works with ethers v6 JsonRpcProvider without
 * coupling the Drop Hunter domain to a specific SDK implementation.
 */
export interface EvmReceiptProvider {
  getTransactionReceipt(
    txHash: string,
  ): Promise<EvmTransactionReceipt | null>;
}

export interface EvmSigner {
  getAddress(): Promise<string>;
  sendTransaction(
    request: EvmTransactionRequest,
  ): Promise<EvmTransactionResponse>;
}

export type EvmTransactionResolver = (
  action: PlannedAction,
  context: ExecutionAdapterContext,
) => EvmTransactionRequest | Promise<EvmTransactionRequest>;

export interface EvmExecutionAdapterOptions {
  supportedActionIds: Iterable<string>;
  chainIds?: Iterable<number>;
  resolveTransaction: EvmTransactionResolver;
}

export interface EvmConfirmationResult {
  status: "confirmed" | "failed" | "unknown";
  txHash: string;
  blockNumber?: number;
  note?: string;
}

function normalizeStatus(
  status: number | bigint | null | undefined,
): "confirmed" | "failed" | "unknown" {
  if (status === 1 || status === 1n) return "confirmed";
  if (status === 0 || status === 0n) return "failed";
  return "unknown";
}

/**
 * Real EVM transaction adapter for Drop Hunter.
 *
 * The adapter performs one external side effect: sendTransaction(). It never
 * treats a returned transaction hash as confirmation. Confirmation is an
 * explicit reconciliation step through confirm(). This matches the
 * idempotency rules in execution-idempotency.ts and prevents an RPC response
 * from being mistaken for on-chain finality.
 */
export class EvmExecutionAdapter implements ExecutionAdapter {
  readonly id: string;
  private readonly supportedActionIds: Set<string>;
  private readonly chainIds?: Set<number>;

  constructor(
    id: string,
    private readonly signer: EvmSigner,
    private readonly provider: EvmReceiptProvider,
    private readonly options: EvmExecutionAdapterOptions,
  ) {
    this.id = id;
    this.supportedActionIds = new Set(options.supportedActionIds);
    this.chainIds = options.chainIds ? new Set(options.chainIds) : undefined;

    if (this.supportedActionIds.size === 0) {
      throw new Error("EVM execution adapter requires at least one supported action");
    }
    if (this.chainIds && this.chainIds.size === 0) {
      throw new Error("EVM execution adapter chainIds cannot be empty");
    }
  }

  supports(action: PlannedAction): boolean {
    return this.supportedActionIds.has(action.id);
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
        note: `EVM adapter does not support action: ${action.id}`,
      };
    }

    if (action.requiresWallet && !context.walletConnected) {
      return {
        status: "failed",
        timestamp: context.timestamp,
        chainId: context.chainId,
        note: "wallet connection is required",
      };
    }

    if (action.requiresGas && !context.gasAvailable) {
      return {
        status: "failed",
        timestamp: context.timestamp,
        chainId: context.chainId,
        note: "gas availability is required",
      };
    }

    if (
      this.chainIds &&
      (context.chainId === undefined || !this.chainIds.has(context.chainId))
    ) {
      return {
        status: "failed",
        timestamp: context.timestamp,
        chainId: context.chainId,
        note: `unsupported EVM chain for adapter: ${context.chainId ?? "unknown"}`,
      };
    }

    try {
      const request = await this.options.resolveTransaction(action, context);
      const response = await this.signer.sendTransaction(request);

      return {
        status: "success",
        timestamp: context.timestamp,
        chainId: context.chainId,
        txHash: response.hash,
        note: "transaction submitted; confirmation pending",
      };
    } catch (error) {
      return {
        status: "failed",
        timestamp: context.timestamp,
        chainId: context.chainId,
        note: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async confirm(
    txHash: string,
  ): Promise<EvmConfirmationResult> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (!receipt) {
        return {
          status: "unknown",
          txHash,
          note: "transaction receipt is not available yet",
        };
      }

      const status = normalizeStatus(receipt.status);
      return {
        status,
        txHash: receipt.transactionHash ?? txHash,
        blockNumber: receipt.blockNumber ?? undefined,
        note:
          status === "confirmed"
            ? "transaction confirmed on-chain"
            : status === "failed"
              ? "transaction receipt reports failure"
              : "transaction receipt has no final status",
      };
    } catch (error) {
      return {
        status: "unknown",
        txHash,
        note: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async signerAddress(): Promise<string> {
    return this.signer.getAddress();
  }
}
