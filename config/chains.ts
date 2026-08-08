export type ChainKind = "evm" | "non-evm" | "unknown";

export interface ChainConfig {
  key: string;
  name: string;
  kind: ChainKind;
  enabled: boolean;
  chainId?: number;
  rpcEnv?: string;
  explorerUrl?: string;
  notes?: string;
}

/**
 * Network registry. RPC URLs and private keys are deliberately loaded from
 * environment variables and are never committed to the repository.
 */
export const chains: ChainConfig[] = [
  { key: "plasma", name: "Plasma", kind: "evm", enabled: true, chainId: 9746, rpcEnv: "PLASMA_RPC_URL", explorerUrl: "https://testnet.plasmascan.to" },
  { key: "arcTestnet", name: "Arc Testnet", kind: "evm", enabled: true, chainId: 5042002, rpcEnv: "ARC_RPC_URL", explorerUrl: "https://testnet.arcscan.app", notes: "USDC is the native gas currency on Arc Testnet." },
  { key: "tempoTestnet", name: "Tempo Testnet (Moderato)", kind: "evm", enabled: true, chainId: 42431, rpcEnv: "TEMPO_RPC_URL", explorerUrl: "https://explore.tempo.xyz", notes: "Tempo has no native gas token; transaction fees are paid in TIP-20 stablecoins." },
  { key: "stable", name: "Stable", kind: "evm", enabled: false, rpcEnv: "STABLE_RPC_URL" },
  { key: "simplechain", name: "SimpleChain", kind: "evm", enabled: false, rpcEnv: "SIMPLECHAIN_RPC_URL" },
  { key: "dacInception", name: "DAC Inception", kind: "evm", enabled: false, rpcEnv: "DAC_INCEPTION_RPC_URL" },
  { key: "litvm", name: "LitVM Chain", kind: "evm", enabled: false, rpcEnv: "LITVM_RPC_URL" },
  { key: "giwa", name: "Giwa", kind: "evm", enabled: false, rpcEnv: "GIWA_RPC_URL" },
  { key: "rise", name: "RISE", kind: "evm", enabled: false, rpcEnv: "RISE_RPC_URL" },
  { key: "kii", name: "Kii Chain", kind: "evm", enabled: false, rpcEnv: "KII_RPC_URL" },
  { key: "neura", name: "Neura", kind: "evm", enabled: false, rpcEnv: "NEURA_RPC_URL" },
  { key: "puch", name: "Puch", kind: "evm", enabled: false, rpcEnv: "PUCH_RPC_URL" },
  { key: "x1", name: "X1 Eco Chain", kind: "evm", enabled: false, rpcEnv: "X1_RPC_URL" },
  { key: "iopn", name: "IOPN", kind: "evm", enabled: false, rpcEnv: "IOPN_RPC_URL" },
  { key: "sepolia", name: "Ethereum Sepolia", kind: "evm", enabled: true, chainId: 11155111, rpcEnv: "SEPOLIA_RPC_URL" },
  { key: "baseSepolia", name: "Base Sepolia", kind: "evm", enabled: true, chainId: 84532, rpcEnv: "BASE_SEPOLIA_RPC_URL" },
  { key: "robinhood", name: "Robinhood", kind: "evm", enabled: false, rpcEnv: "ROBINHOOD_RPC_URL" },
  { key: "ink", name: "Ink", kind: "evm", enabled: false, rpcEnv: "INK_RPC_URL" },
  { key: "arbitrum", name: "Arbitrum", kind: "evm", enabled: false, rpcEnv: "ARBITRUM_RPC_URL" },
  { key: "bnb", name: "BNB Smart Chain", kind: "evm", enabled: false, rpcEnv: "BNB_RPC_URL" },
  { key: "opbnb", name: "opBNB", kind: "evm", enabled: false, rpcEnv: "OPBNB_RPC_URL" },
  { key: "og", name: "OG", kind: "evm", enabled: false, rpcEnv: "OG_RPC_URL" },
  { key: "hertzflow", name: "HertzFlow", kind: "evm", enabled: false, rpcEnv: "HERTZFLOW_RPC_URL" },
  { key: "scripchain", name: "Scripchain", kind: "evm", enabled: false, rpcEnv: "SCRIPCHAIN_RPC_URL" },
  { key: "janus", name: "Janus", kind: "evm", enabled: false, rpcEnv: "JANUS_RPC_URL" },
  { key: "optimism", name: "Optimism", kind: "evm", enabled: false, rpcEnv: "OPTIMISM_RPC_URL" },
  { key: "avalanche", name: "Avalanche", kind: "evm", enabled: false, rpcEnv: "AVALANCHE_RPC_URL" },
  { key: "zetachain", name: "ZetaChain", kind: "evm", enabled: false, rpcEnv: "ZETACHAIN_RPC_URL" },
  { key: "xlayer", name: "X Layer", kind: "evm", enabled: false, rpcEnv: "XLAYER_RPC_URL" },
  { key: "hyperevm", name: "HyperEVM", kind: "evm", enabled: false, rpcEnv: "HYPEREVM_RPC_URL" },
  { key: "polygon", name: "Polygon", kind: "evm", enabled: false, rpcEnv: "POLYGON_RPC_URL" },
  { key: "abstract", name: "Abstract", kind: "evm", enabled: false, rpcEnv: "ABSTRACT_RPC_URL" },
  { key: "linea", name: "Linea", kind: "evm", enabled: false, rpcEnv: "LINEA_RPC_URL" },
  { key: "mantle", name: "Mantle", kind: "evm", enabled: false, rpcEnv: "MANTLE_RPC_URL" },
  { key: "plume", name: "Plume", kind: "evm", enabled: false, rpcEnv: "PLUME_RPC_URL" },
  { key: "sei", name: "Sei", kind: "evm", enabled: false, rpcEnv: "SEI_RPC_URL" },
  { key: "sui", name: "Sui", kind: "non-evm", enabled: false, notes: "Requires a separate Move implementation and adapter." },
];

export const evmChains = chains.filter((chain) => chain.kind === "evm");
