import type { PlannedAction } from "./action-planner.js";
import type { ExecutionGate, ExecutionGateDecision } from "./execution-gate.js";
import type { ExecutionHandlerResult } from "./execution-runner.js";
import type { TransactionCall, TransactionPreview, TransactionPreviewBuilder } from "./transaction-preview.js";

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface WalletExecutionRequest {
  action: PlannedAction;
  decision: ExecutionGateDecision;
  preview: TransactionPreview;
  walletAddress: string;
  provider: Eip1193Provider;
  chainId?: number;
  approvedPreviewHash?: string;
}

export class WalletExecutionAdapter {
  constructor(
    private readonly gate: ExecutionGate,
    private readonly previewBuilder: TransactionPreviewBuilder,
  ) {}

  prepare(action: PlannedAction, context: { chainId?: number }): TransactionPreview {
    return this.previewBuilder.build(action, context);
  }

  async execute(request: WalletExecutionRequest): Promise<ExecutionHandlerResult> {
    if (!request.decision.allowed) {
      return { status: "failed", chainId: request.chainId, note: request.decision.reason };
    }
    if (!request.walletAddress) {
      return { status: "failed", chainId: request.chainId, note: "wallet address is required" };
    }
    if (request.preview.previewHash !== request.approvedPreviewHash) {
      return { status: "failed", chainId: request.chainId, note: "approved transaction preview does not match the execution request" };
    }

    if (request.preview.calls.length === 0) {
      return {
        status: "failed",
        chainId: request.chainId,
        note: "transaction preview contains no calls; a trusted action adapter must provide the exact transaction payload",
      };
    }

    const txHashes: string[] = [];
    try {
      for (const call of request.preview.calls) {
        const txHash = await sendTransaction(request.provider, request.walletAddress, call);
        if (typeof txHash !== "string" || !txHash) throw new Error("wallet provider returned an invalid transaction hash");
        txHashes.push(txHash);
      }
      return {
        status: "success",
        chainId: request.chainId,
        txHash: txHashes[txHashes.length - 1],
        note: `executed ${txHashes.length} approved transaction call(s)`
      };
    } catch (error) {
      return {
        status: "failed",
        chainId: request.chainId,
        txHash: txHashes[txHashes.length - 1],
        note: error instanceof Error ? error.message : String(error),
      };
    }
  }

  evaluate(action: PlannedAction, context: Parameters<ExecutionGate["evaluate"]>[0]): ExecutionGateDecision {
    return this.gate.evaluate(context);
  }
}

async function sendTransaction(
  provider: Eip1193Provider,
  walletAddress: string,
  call: TransactionCall,
): Promise<unknown> {
  const transaction: Record<string, string> = {
    from: walletAddress,
    to: call.to,
  };
  if (call.data !== undefined) transaction.data = call.data;
  if (call.value !== undefined) transaction.value = call.value;
  return provider.request({ method: "eth_sendTransaction", params: [transaction] });
}
