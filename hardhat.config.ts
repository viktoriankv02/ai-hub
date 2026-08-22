import "dotenv/config";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      chainId: 11155111,
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    baseSepolia: {
      type: "http",
      chainType: "op",
      url: configVariable("BASE_SEPOLIA_RPC_URL"),
      chainId: 84532,
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    inkSepolia: {
      type: "http",
      chainType: "op",
      url: configVariable("INK_SEPOLIA_RPC_URL"),
      chainId: 763373,
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    arbitrumSepolia: {
      type: "http",
      chainType: "op",
      url: configVariable("ARBITRUM_SEPOLIA_RPC_URL"),
      chainId: 421614,
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    optimismSepolia: {
      type: "http",
      chainType: "op",
      url: configVariable("OPTIMISM_SEPOLIA_RPC_URL"),
      chainId: 11155420,
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    bnbTestnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("BNB_TESTNET_RPC_URL"),
      chainId: 97,
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    avalancheFuji: {
      type: "http",
      chainType: "l1",
      url: configVariable("AVALANCHE_FUJI_RPC_URL"),
      chainId: 43113,
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    polygonAmoy: {
      type: "http",
      chainType: "l1",
      url: configVariable("POLYGON_AMOY_RPC_URL"),
      chainId: 80002,
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    plasmaTestnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("PLASMA_RPC_URL"),
      chainId: 9746,
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    arcTestnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("ARC_RPC_URL"),
      chainId: 5042002,
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    tempoTestnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("TEMPO_RPC_URL"),
      chainId: 42431,
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
});
