import { chains, type ChainConfig } from "../../config/chains.js";

export interface DropHunterChainReadiness {
  key: string;
  name: string;
  kind: ChainConfig["kind"];
  enabled: boolean;
  chainId?: number;
  explorerUrl?: string;
  rpcConfigured: boolean;
  usableForPlanning: boolean;
  notes?: string;
}

export function getDropHunterChainReadiness(
  env: NodeJS.ProcessEnv = process.env,
  registry: readonly ChainConfig[] = chains,
): DropHunterChainReadiness[] {
  return registry.map((chain) => {
    const rpcConfigured = Boolean(chain.rpcEnv && env[chain.rpcEnv]?.trim());
    return {
      key: chain.key,
      name: chain.name,
      kind: chain.kind,
      enabled: chain.enabled,
      chainId: chain.chainId,
      explorerUrl: chain.explorerUrl,
      rpcConfigured,
      usableForPlanning: chain.enabled && chain.kind === "evm" && chain.chainId !== undefined,
      notes: chain.notes,
    };
  });
}

export function findDropHunterChain(chainId: number, registry: readonly ChainConfig[] = chains): ChainConfig | undefined {
  return registry.find((chain) => chain.chainId === chainId);
}
