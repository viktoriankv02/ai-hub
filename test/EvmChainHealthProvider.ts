import { expect } from "chai";
import type { ChainConfig } from "../config/chains.js";
import { EvmChainHealthProvider, createEvmChainHealthProvider } from "../agents/multi-chain/evm-chain-health-provider.js";

describe("EvmChainHealthProvider", () => {
  const chain: ChainConfig = {
    key: "baseSepolia",
    name: "Base Sepolia",
    kind: "evm",
    enabled: true,
    chainId: 84532,
    rpcEnv: "BASE_SEPOLIA_RPC_URL",
  };

  it("creates a provider only when the configured environment contains an RPC URL", () => {
    const provider = createEvmChainHealthProvider(chain, {
      BASE_SEPOLIA_RPC_URL: "https://example.invalid/rpc",
    });

    expect(provider).to.be.instanceOf(EvmChainHealthProvider);
    expect(provider?.chain.key).to.equal("baseSepolia");
  });

  it("returns undefined when the RPC environment variable is missing", () => {
    const provider = createEvmChainHealthProvider(chain, {});

    expect(provider).to.equal(undefined);
  });

  it("returns undefined for a non-EVM chain", () => {
    const provider = createEvmChainHealthProvider({
      ...chain,
      kind: "non-evm",
    }, {
      BASE_SEPOLIA_RPC_URL: "https://example.invalid/rpc",
    });

    expect(provider).to.equal(undefined);
  });

  it("rejects an empty RPC URL in the concrete provider", () => {
    expect(() => new EvmChainHealthProvider(chain, "   ")).to.throw("RPC URL is empty for baseSepolia");
  });

  it("rejects non-EVM chains in the concrete provider", () => {
    expect(() => new EvmChainHealthProvider({ ...chain, kind: "non-evm" }, "https://example.invalid/rpc"))
      .to.throw("chain baseSepolia is not EVM");
  });
});
