import { JsonRpcProvider, Wallet, type Provider } from "ethers";
import { EVM_NETWORKS, getRpcUrl, type EvmNetworkConfig } from "../../deploy/config/networks.js";
import { EvmExecutionAdapter, type EvmExecutionAdapterOptions } from "./evm-execution-adapter.js";

export interface EvmRuntimeConfig {
  network: string;
  privateKey: string;
  requireTestnet?: boolean;
}

export interface EvmRuntimePreflight {
  network: EvmNetworkConfig;
  chainId: bigint;
  account: string;
  balance: bigint;
}

export interface EvmExecutionRuntime {
  network: EvmNetworkConfig;
  provider: JsonRpcProvider;
  signer: Wallet;
  adapter: EvmExecutionAdapter;
  preflight(): Promise<EvmRuntimePreflight>;
}

function resolveNetwork(key: string, requireTestnet: boolean): EvmNetworkConfig {
  const network = EVM_NETWORKS[key];
  if (!network) throw new Error(`Unknown EVM network: ${key}`);
  if (requireTestnet && !network.testnet) {
    throw new Error(`Refusing non-testnet EVM network: ${key}`);
  }
  return network;
}

export function createEvmExecutionRuntime(
  config: EvmRuntimeConfig,
  adapterId: string,
  adapterOptions: EvmExecutionAdapterOptions,
): EvmExecutionRuntime {
  const requireTestnet = config.requireTestnet ?? true;
  const network = resolveNetwork(config.network, requireTestnet);
  if (!config.privateKey) throw new Error("EVM execution requires a private key");

  const rpcUrl = getRpcUrl(network.key);
  const provider = new JsonRpcProvider(rpcUrl, network.chainId, { staticNetwork: true });
  const signer = new Wallet(config.privateKey, provider);
  const adapter = new EvmExecutionAdapter(adapterId, signer, provider, {
    ...adapterOptions,
    chainIds: adapterOptions.chainIds ?? [network.chainId],
  });

  return {
    network,
    provider,
    signer,
    adapter,
    async preflight(): Promise<EvmRuntimePreflight> {
      const [rpcNetwork, account] = await Promise.all([
        provider.getNetwork(),
        signer.getAddress(),
      ]);

      if (rpcNetwork.chainId !== BigInt(network.chainId)) {
        throw new Error(
          `RPC chain mismatch: expected ${network.chainId}, got ${rpcNetwork.chainId}`,
        );
      }

      const balance = await provider.getBalance(account);
      return {
        network,
        chainId: rpcNetwork.chainId,
        account,
        balance,
      };
    },
  };
}

export function createEvmRuntimeFromEnv(
  adapterId: string,
  adapterOptions: EvmExecutionAdapterOptions,
  env: NodeJS.ProcessEnv = process.env,
): EvmExecutionRuntime {
  const network = env.AI_HUB_NETWORK ?? "baseSepolia";
  const privateKey = env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) throw new Error("Missing DEPLOYER_PRIVATE_KEY");

  return createEvmExecutionRuntime(
    {
      network,
      privateKey,
      requireTestnet: true,
    },
    adapterId,
    adapterOptions,
  );
}

export function isProviderCompatible(provider: Provider): boolean {
  return typeof provider.getNetwork === "function" && typeof provider.getBalance === "function";
}
