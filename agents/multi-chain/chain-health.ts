import type { ChainConfig } from "../../config/chains.js";

export type ChainHealthStatus = "ready" | "disabled" | "misconfigured" | "unreachable" | "chain-id-mismatch" | "unsupported";

export interface ChainHealthProvider {
  getChainId(): Promise<number> | number;
  getBlockNumber?(): Promise<number> | number;
}

export interface ChainHealthResult {
  chainKey: string;
  name: string;
  status: ChainHealthStatus;
  enabled: boolean;
  configured: boolean;
  reachable: boolean;
  expectedChainId?: number;
  actualChainId?: number;
  blockNumber?: number;
  rpcEnv?: string;
  note?: string;
}

export type ChainHealthProviderFactory = (
  chain: ChainConfig,
) => ChainHealthProvider | undefined;

export interface ChainHealthServiceOptions {
  providerFactory?: ChainHealthProviderFactory;
}

export class ChainHealthService {
  constructor(
    private readonly chains: readonly ChainConfig[],
    private readonly options: ChainHealthServiceOptions = {},
  ) {}

  getChain(chainKey: string): ChainConfig | undefined {
    return this.chains.find((chain) => chain.key === chainKey);
  }

  async check(chainKey: string): Promise<ChainHealthResult> {
    const chain = this.getChain(chainKey);
    if (!chain) {
      return {
        chainKey,
        name: chainKey,
        status: "misconfigured",
        enabled: false,
        configured: false,
        reachable: false,
        note: `unknown chain: ${chainKey}`,
      };
    }

    if (!chain.enabled) {
      return {
        chainKey: chain.key,
        name: chain.name,
        status: "disabled",
        enabled: false,
        configured: true,
        reachable: false,
        expectedChainId: chain.chainId,
        rpcEnv: chain.rpcEnv,
        note: `chain is disabled: ${chain.key}`,
      };
    }

    if (chain.kind !== "evm" && chain.kind !== "non-evm") {
      return {
        chainKey: chain.key,
        name: chain.name,
        status: "unsupported",
        enabled: true,
        configured: false,
        reachable: false,
        expectedChainId: chain.chainId,
        rpcEnv: chain.rpcEnv,
        note: `unsupported chain kind: ${chain.kind}`,
      };
    }

    const provider = this.options.providerFactory?.(chain);
    if (!provider) {
      return {
        chainKey: chain.key,
        name: chain.name,
        status: "misconfigured",
        enabled: true,
        configured: false,
        reachable: false,
        expectedChainId: chain.chainId,
        rpcEnv: chain.rpcEnv,
        note: chain.rpcEnv
          ? `no health provider configured for ${chain.key}; expected RPC env ${chain.rpcEnv}`
          : `no health provider configured for ${chain.key}`,
      };
    }

    try {
      const actualChainId = await provider.getChainId();
      const blockNumber = provider.getBlockNumber ? await provider.getBlockNumber() : undefined;

      if (chain.chainId !== undefined && actualChainId !== chain.chainId) {
        return {
          chainKey: chain.key,
          name: chain.name,
          status: "chain-id-mismatch",
          enabled: true,
          configured: true,
          reachable: true,
          expectedChainId: chain.chainId,
          actualChainId,
          blockNumber,
          rpcEnv: chain.rpcEnv,
          note: `RPC responded with chainId ${actualChainId}, expected ${chain.chainId}`,
        };
      }

      return {
        chainKey: chain.key,
        name: chain.name,
        status: "ready",
        enabled: true,
        configured: true,
        reachable: true,
        expectedChainId: chain.chainId,
        actualChainId,
        blockNumber,
        rpcEnv: chain.rpcEnv,
        note: "read-only RPC health check passed",
      };
    } catch (error) {
      return {
        chainKey: chain.key,
        name: chain.name,
        status: "unreachable",
        enabled: true,
        configured: true,
        reachable: false,
        expectedChainId: chain.chainId,
        rpcEnv: chain.rpcEnv,
        note: error instanceof Error ? error.message : "RPC health check failed",
      };
    }
  }

  async checkAll(): Promise<ChainHealthResult[]> {
    return Promise.all(this.chains.map((chain) => this.check(chain.key)));
  }

  async readyChains(): Promise<ChainHealthResult[]> {
    const results = await this.checkAll();
    return results.filter((result) => result.status === "ready");
  }
}
