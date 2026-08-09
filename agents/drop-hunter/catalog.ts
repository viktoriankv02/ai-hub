import type { ProjectOpportunity } from "./types.js";

/**
 * First-wave targets for the AI Hub builder/tester strategy.
 *
 * Scores are intentionally conservative: external claims such as funding,
 * rewards or incentive programs must be supplied as evidence before they
 * affect the ranking.
 */
export const PRIORITY_OPPORTUNITIES: ProjectOpportunity[] = [
  {
    id: "ink-sepolia",
    name: "Ink Sepolia",
    chainId: 763373,
    vm: "EVM",
    stage: "testnet",
    priority: 100,
    signals: { testnetActivity: 80, onchainVerifiability: 90, userFit: 100, timing: 80 },
    sources: ["config/chainCatalog.ts"],
    actions: ["deploy ERC20", "deploy NFT", "verify contract", "record activity"],
    notes: "Primary Ink builder/tester target.",
  },
  {
    id: "plasma-testnet",
    name: "Plasma Testnet",
    chainId: 9746,
    vm: "EVM",
    stage: "testnet",
    priority: 98,
    signals: { testnetActivity: 80, onchainVerifiability: 90, userFit: 100, timing: 80 },
    sources: ["deploy/README.md", "config/chainCatalog.ts"],
    actions: ["deploy core", "deploy EVM adapter", "register chain", "verify configuration"],
  },
  {
    id: "arc-testnet",
    name: "Arc Testnet",
    chainId: 5042002,
    vm: "EVM",
    stage: "testnet",
    priority: 97,
    signals: { testnetActivity: 80, onchainVerifiability: 90, userFit: 100, timing: 80 },
    sources: ["deploy/README.md", "config/chainCatalog.ts"],
    actions: ["deploy core", "deploy EVM adapter", "register chain", "verify configuration"],
  },
  {
    id: "tempo-moderato",
    name: "Tempo Testnet (Moderato)",
    chainId: 42431,
    vm: "EVM",
    stage: "testnet",
    priority: 96,
    signals: { testnetActivity: 80, onchainVerifiability: 90, userFit: 100, timing: 80 },
    sources: ["deploy/README.md", "config/chainCatalog.ts"],
    actions: ["deploy core", "deploy EVM adapter", "register chain", "verify configuration"],
  },
  {
    id: "base-sepolia",
    name: "Base Sepolia",
    chainId: 84532,
    vm: "EVM",
    stage: "testnet",
    priority: 94,
    signals: { testnetActivity: 75, onchainVerifiability: 95, userFit: 100, timing: 70 },
    sources: ["config/chainCatalog.ts"],
    actions: ["deploy core", "deploy EVM adapter", "record verified activity", "test reward flow"],
  },
  {
    id: "ethereum-sepolia",
    name: "Ethereum Sepolia",
    chainId: 11155111,
    vm: "EVM",
    stage: "testnet",
    priority: 90,
    signals: { testnetActivity: 70, onchainVerifiability: 100, userFit: 100, timing: 60 },
    sources: ["deploy/README.md", "config/chainCatalog.ts"],
    actions: ["deploy core", "deploy EVM adapter", "verify contract", "record activity"],
  },
];
