import type { PlannedAction } from "./action-planner.js";
import type { ExecutionGate, ExecutionGateDecision } from "./execution-gate.js";
import type { ExecutionHandlerResult } from "./execution-runner.js";
import {
  fingerprintTransactionPreview,
  type TransactionCall,
  type TransactionPreview,
  type TransactionPreviewBuilder,
} from "./transaction-preview.js";

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

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const CHAIN_ID_RE = /^0x[0-9a-fA-F]+$/;

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function parseChainId(value: unknown): number | undefined {
  if (typeof value !== "string" || !CHAIN_ID_RE.test(value)) return undefined;
  const chainId = Number.parseInt(value.slice(2), 16);
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : undefined;
}

function validateCallChain(call: TransactionCall, expectedChainId: number | undefined): string | undefined {
  if (call.chainId === undefined || expectedChainId === undefined) return undefined;
  if (call.chainId !== expectedChainId) {
    return `transaction call targets chain ${call.chainId}, but execution chain is ${expectedChainId}`;
  }
  return undefined;
}

function verifyPreviewIntegrity(preview: TransactionPreview): boolean {
  return fingerprintTransactionPreview(preview) === preview.previewHash;
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
    if (!request.walletAddress || !ADDRESS_RE.test(request.walletAddress)) {
      return { status: "failed", chainId: request.chainId, note: "valid wallet address is required" };
    }
    if (!request.approvedPreviewHash || request.preview.previewHash !== request.approvedPreviewHash) {
      return { status: "failed", chainId: request.chainId, note: "approved transaction preview does not match the execution request" };
    }
    if (!verifyPreviewIntegrity(request.preview)) {
      return { status: "failed", chainId: request.chainId, note: "transaction preview fingerprint is invalid or the preview was modified after approval" };
    }
    if (request.preview.calls.length === 0) {
      return {
        status: "failed",
        chainId: request.chainId,
        note: "transaction preview contains no calls; a trusted action adapter must provide the exact transaction payload",
      };
    }
    if (request.preview.chainId !== undefined && request.chainId !== undefined && request.preview.chainId !== request.chainId) {
      return {
        status: "failed",
        chainId: request.chainId,
        note: `transaction preview targets chain ${request.preview.chainId}, but execution chain is ${request.chainId}`,
      };
    }

    for (const call of request.preview.calls) {
      const chainError = validateCallChain(call, request.chainId ?? request.preview.chainId);
      if (chainError) return { status: "failed", chainId: request.chainId, note: chainError };
      if (!ADDRESS_RE.test(call.to)) {
        return { status: "failed", chainId: request.chainId, note: `invalid transaction target address: ${call.to}` };
      }
      if (call.data !== undefined && !/^0x[0-9a-fA-F]*$/.test(call.data)) {
        return { status: "failed", chainId: request.chainId, note: "invalid transaction calldata" };
      }
      if (call.value !== undefined && !/^(0|[1-9][0-9]*)$/.test(call.value)) {
        return { status: "failed", chainId: request.chainId, note: "invalid transaction value" };
      }
    }

    try {
      const accounts = await request.provider.request({ method: "eth_accounts" });
      if (!Array.isArray(accounts) || !accounts.some((account) => typeof account === "string" && normalizeAddress(account) === normalizeAddress(request.walletAddress))) {
        return { status: "failed", chainId: request.chainId, note: "wallet is not the currently connected account" };
      }

      const providerChainId = parseChainId(await request.provider.request({ method: "eth_chainId" }));
      if (providerChainId === undefined) {
        return { status: "failed", chainId: request.chainId, note: "wallet provider returned an invalid chain id" };
      }
      const expectedChainId = request.chainId ?? request.preview.chainId;
      if (expectedChainId !== undefined && providerChainId !== expectedChainId) {
        return {
          status: "failed",
          chainId: expectedChainId,
          note: `wallet provider is on chain ${providerChainId}, expected ${expectedChainId}`,
        };
      }

      const txHashes: string[] = [];
      for (const call of request.preview.calls) {
        try {
          const txHash = await sendTransaction(request.provider, request.walletAddress, call);
          if (typeof txHash !== "string" || !txHash) throw new Error("wallet provider returned an invalid transaction hash");
          txHashes.push(txHash);
        } catch (error) {
          const note = error instanceof Error ? error.message : String(error);
          if (txHashes.length > 0) {
            return {
              status: "failed",
              chainId: expectedChainId,
              txHash: txHashes[txHashes.length - 1],
              txHashes,
              note: `batch execution partially submitted; reconciliation is required before retry: ${note}`,
            };
          }
          throw error;
        }
      }

      return {
        status: "success",
        chainId: expectedChainId,
        txHash: txHashes[txHashes.length - 1],
        txHashes,
        note: `executed ${txHashes.length} approved transaction call(s)`,
      };
    } catch (error) {
      return {
        status: "failed",
        chainId: request.chainId,
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
