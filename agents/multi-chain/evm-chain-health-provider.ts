import { JsonRpcProvider } from "ethers";
import type { ChainConfig } from "../../config/chains.js";
import type { ChainHealthProvider } from "./chain-health.js";

export interface EvmChainHealthProviderOptions {
  polling?: boolean;
}

export class EvmChainHealthProvider implements ChainHealthProvider {
  readonly provider: JsonRpcProvider;

  constructor(
    readonly chain: ChainConfig,
    rpcUrl: string,
    options: EvmChainHealthProviderOptions = {},
  ) {
    if (chain.kind !== "evm") throw new Error(`chain ${chain.key} is not EVM`);
    if (!rpcUrl.trim()) throw new Error(`RPC URL is empty for ${chain.key}`);

    this.provider = new JsonRpcProvider(rpcUrl, chain.chainId, {
      staticNetwork: chain.chainId === undefined ? undefined : true,
    });

    if (options.polling === false) this.provider.pollingInterval = 60_000;
  }

  async getChainId(): Promise<number> {
    const network = await this.provider.getNetwork();
    return Number(network.chainId);
  }

  async getBlockNumber(): Promise<number> {
    return this.provider.getBlockNumber();
  }
}

export interface EvmChainHealthEnvironment {
  [key: string]: string | undefined;
}

export function createEvmChainHealthProvider(
  chain: ChainConfig,
  environment: EvmChainHealthEnvironment = process.env,
  options: EvmChainHealthProviderOptions = {},
): EvmChainHealthProvider | undefined {
  if (chain.kind !== "evm" || !chain.rpcEnv) return undefined;

  const rpcUrl = environment[chain.rpcEnv];
  if (!rpcUrl?.trim()) return undefined;

  return new EvmChainHealthProvider(chain, rpcUrl, options);
}
