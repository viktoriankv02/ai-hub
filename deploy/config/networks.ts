export type EvmNetworkConfig = {
  key: string;
  name: string;
  chainId: number;
  rpcEnv: string;
  explorerEnv?: string;
  testnet: boolean;
};

export const EVM_NETWORKS: Record<string, EvmNetworkConfig> = {
  sepolia: {
    key: "sepolia",
    name: "Ethereum Sepolia",
    chainId: 11155111,
    rpcEnv: "SEPOLIA_RPC_URL",
    explorerEnv: "SEPOLIA_EXPLORER_URL",
    testnet: true,
  },
  baseSepolia: {
    key: "baseSepolia",
    name: "Base Sepolia",
    chainId: 84532,
    rpcEnv: "BASE_SEPOLIA_RPC_URL",
    explorerEnv: "BASE_SEPOLIA_EXPLORER_URL",
    testnet: true,
  },
  arbitrumSepolia: {
    key: "arbitrumSepolia",
    name: "Arbitrum Sepolia",
    chainId: 421614,
    rpcEnv: "ARBITRUM_SEPOLIA_RPC_URL",
    explorerEnv: "ARBITRUM_SEPOLIA_EXPLORER_URL",
    testnet: true,
  },
  optimismSepolia: {
    key: "optimismSepolia",
    name: "Optimism Sepolia",
    chainId: 11155420,
    rpcEnv: "OPTIMISM_SEPOLIA_RPC_URL",
    explorerEnv: "OPTIMISM_SEPOLIA_EXPLORER_URL",
    testnet: true,
  },
  bnbTestnet: {
    key: "bnbTestnet",
    name: "BNB Smart Chain Testnet",
    chainId: 97,
    rpcEnv: "BNB_TESTNET_RPC_URL",
    explorerEnv: "BNB_TESTNET_EXPLORER_URL",
    testnet: true,
  },
  avalancheFuji: {
    key: "avalancheFuji",
    name: "Avalanche Fuji",
    chainId: 43113,
    rpcEnv: "AVALANCHE_FUJI_RPC_URL",
    explorerEnv: "AVALANCHE_FUJI_EXPLORER_URL",
    testnet: true,
  },
  polygonAmoy: {
    key: "polygonAmoy",
    name: "Polygon Amoy",
    chainId: 80002,
    rpcEnv: "POLYGON_AMOY_RPC_URL",
    explorerEnv: "POLYGON_AMOY_EXPLORER_URL",
    testnet: true,
  },
  plasmaTestnet: {
    key: "plasmaTestnet",
    name: "Plasma Testnet",
    chainId: 9746,
    rpcEnv: "PLASMA_RPC_URL",
    explorerEnv: "PLASMA_EXPLORER_URL",
    testnet: true,
  },
  arcTestnet: {
    key: "arcTestnet",
    name: "Arc Testnet",
    chainId: 5042002,
    rpcEnv: "ARC_RPC_URL",
    explorerEnv: "ARC_EXPLORER_URL",
    testnet: true,
  },
  tempoTestnet: {
    key: "tempoTestnet",
    name: "Tempo Testnet (Moderato)",
    chainId: 42431,
    rpcEnv: "TEMPO_RPC_URL",
    explorerEnv: "TEMPO_EXPLORER_URL",
    testnet: true,
  },
};

export function getRpcUrl(key: string): string {
  const config = EVM_NETWORKS[key];
  if (!config) throw new Error(`Unknown network: ${key}`);
  const value = process.env[config.rpcEnv];
  if (!value) throw new Error(`Missing ${config.rpcEnv}`);
  return value;
}

export function getExplorerUrl(key: string): string | undefined {
  const config = EVM_NETWORKS[key];
  if (!config) throw new Error(`Unknown network: ${key}`);
  return config.explorerEnv ? process.env[config.explorerEnv] : undefined;
}
