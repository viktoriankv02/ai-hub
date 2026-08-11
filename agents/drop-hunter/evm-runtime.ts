import { JsonRpcProvider, Wallet, type TransactionReceipt, type TransactionRequest } from "ethers";
import type { PlannedAction } from "./action-planner.js";
import { EvmExecutionAdapter, type EvmExecutionAdapterOptions } from "./evm-execution-adapter.js";

export interface EvmRuntimeOptions {
  rpcUrl: string;
  privateKey?: string;
  chainId?: number;
  adapterId?: string;
  supportedActionIds: Iterable<string>;
  resolveTransaction: EvmExecutionAdapterOptions["resolveTransaction"];
}

export interface EvmRuntime {
  provider: JsonRpcProvider;
  adapter: EvmExecutionAdapter;
  account?: string;
  chainId: number;
  close(): void;
}

export function createEvmRuntime(options: EvmRuntimeOptions): EvmRuntime {
  if (!options.rpcUrl.trim()) throw new Error("EVM RPC URL is required");
  const provider = new JsonRpcProvider(options.rpcUrl, options.chainId, { staticNetwork: options.chainId !== undefined });
  const signer = options.privateKey ? new Wallet(options.privateKey, provider) : undefined;
  const adapter = new EvmExecutionAdapter(
    options.adapterId ?? "evm-runtime",
    signer ?? new ReadOnlySigner(),
    provider,
    {
      supportedActionIds: options.supportedActionIds,
      chainIds: options.chainId === undefined ? undefined : [options.chainId],
      resolveTransaction: options.resolveTransaction,
    },
  );
  return {
    provider,
    adapter,
    account: signer?.address,
    chainId: options.chainId ?? 0,
    close() { /* ethers provider has no required shutdown */ },
  };
}

export function transactionRequestFromAction(action: PlannedAction, payload?: TransactionRequest): TransactionRequest {
  if (payload === undefined) throw new Error(`No EVM transaction payload configured for action ${action.id}`);
  return payload;
}

export async function waitForReceipt(provider: JsonRpcProvider, txHash: string): Promise<TransactionReceipt | null> {
  return provider.getTransactionReceipt(txHash);
}

class ReadOnlySigner {
  async getAddress(): Promise<string> { throw new Error("EVM runtime has no signing key"); }
  async sendTransaction(): Promise<never> { throw new Error("EVM runtime is read-only"); }
}
