export type UniversalActionKind =
  | "register-agent"
  | "create-job"
  | "assign-job"
  | "complete-job"
  | "claim-reward"
  | "swap"
  | "bridge"
  | "stake"
  | "deploy-contract"
  | "verify-contract"
  | "custom";

export type UniversalExecutionMode = "dry-run" | "simulate" | "execute";

export interface UniversalAction {
  id: string;
  kind: UniversalActionKind;
  chainKey: string;
  payload: Record<string, unknown>;
  requiresWallet?: boolean;
  requiresGas?: boolean;
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}

export interface ChainExecutionContext {
  mode: UniversalExecutionMode;
  timestamp: string;
  chainKey: string;
  chainId?: number;
  walletConnected?: boolean;
  walletAddress?: string;
  gasAvailable?: boolean;
  metadata?: Record<string, string>;
}

export interface UniversalExecutionResult {
  status: "success" | "failed" | "skipped" | "unknown";
  actionId: string;
  chainKey: string;
  timestamp: string;
  txHash?: string;
  executionId?: string;
  note?: string;
  data?: Record<string, unknown>;
}

export interface MultiChainExecutionAdapter {
  readonly id: string;
  readonly chainKeys: ReadonlySet<string>;
  supports(action: UniversalAction): boolean;
  execute(
    action: UniversalAction,
    context: ChainExecutionContext,
  ): UniversalExecutionResult | Promise<UniversalExecutionResult>;
}

export interface UniversalActionRouterOptions {
  now?: () => Date;
  idempotency?: boolean;
}
