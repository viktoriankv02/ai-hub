export type VmType = "EVM" | "SUI" | "CUSTOM";
export type AdapterType = "EVM" | "SUI" | "CUSTOM";

export interface ChainConfig {
  name: string;
  chainId?: number;
  vmType: VmType;
  adapterType: AdapterType;
  enabled: boolean;
  notes?: string;
}

/** Canonical rollout catalog. Deploy only entries with verified chain IDs. */
export const CHAINS: ChainConfig[] = [
  { name: "Ink Sepolia", chainId: 763373, vmType: "EVM", adapterType: "EVM", enabled: true, notes: "Primary Ink testnet target for AI Hub builder/tester activity." },
  { name: "Plasma", chainId: 9746, vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Tempo", chainId: 42431, vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Arc Testnet", chainId: 5042002, vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Sepolia", chainId: 11155111, vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Base Sepolia", chainId: 84532, vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Stable", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "SimpleChain", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "DAC Inception", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "LitVM Chain", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Giwa", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Rise", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Kii Chain", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Neura", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Puch", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "X1 Eco Chain", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "IOPN", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Robinhood", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Ink", chainId: 57073, vmType: "EVM", adapterType: "EVM", enabled: false, notes: "Mainnet tracked for future rollout; deployment remains testnet-first." },
  { name: "Uniswap", vmType: "EVM", adapterType: "EVM", enabled: true, notes: "Protocol integration, not a standalone chain." },
  { name: "Arbitrum", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "BNB", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "opBNB", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "OG", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Hertzflow", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Scripchain", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Janus", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Optimism", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Avalanche", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "ZetaChain", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "X Layer", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "HyperEVM", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Polygon", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Abstract", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Linea", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Mantle", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Plume", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Sei", vmType: "EVM", adapterType: "EVM", enabled: true },
  { name: "Sui", vmType: "SUI", adapterType: "SUI", enabled: true },
];

export function verifiedChains(): ChainConfig[] {
  return CHAINS.filter((chain) => chain.chainId !== undefined);
}
