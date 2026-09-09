import { expect } from "chai";
import type { ChainConfig } from "../config/chains.js";
import { ChainHealthService, type ChainHealthProvider } from "../agents/multi-chain/chain-health.js";

class FakeProvider implements ChainHealthProvider {
  constructor(
    private readonly chainId: number,
    private readonly blockNumber = 100,
    private readonly failure?: Error,
  ) {}

  getChainId(): number {
    if (this.failure) throw this.failure;
    return this.chainId;
  }

  getBlockNumber(): number {
    if (this.failure) throw this.failure;
    return this.blockNumber;
  }
}

describe("ChainHealthService", () => {
  const configured: ChainConfig[] = [
    { key: "baseSepolia", name: "Base Sepolia", kind: "evm", enabled: true, chainId: 84532, rpcEnv: "BASE_SEPOLIA_RPC_URL" },
    { key: "inkSepolia", name: "Ink Sepolia", kind: "evm", enabled: true, chainId: 763373, rpcEnv: "INK_SEPOLIA_RPC_URL" },
    { key: "disabled", name: "Disabled", kind: "evm", enabled: false, chainId: 999, rpcEnv: "DISABLED_RPC_URL" },
  ];

  it("marks a reachable chain with the expected chain id as ready", async () => {
    const service = new ChainHealthService(configured, {
      providerFactory: (chain) => new FakeProvider(chain.chainId ?? 0, 1234),
    });

    const result = await service.check("baseSepolia");

    expect(result.status).to.equal("ready");
    expect(result.configured).to.equal(true);
    expect(result.reachable).to.equal(true);
    expect(result.actualChainId).to.equal(84532);
    expect(result.blockNumber).to.equal(1234);
  });

  it("detects an RPC chain id mismatch before execution", async () => {
    const service = new ChainHealthService(configured, {
      providerFactory: () => new FakeProvider(1, 50),
    });

    const result = await service.check("baseSepolia");

    expect(result.status).to.equal("chain-id-mismatch");
    expect(result.expectedChainId).to.equal(84532);
    expect(result.actualChainId).to.equal(1);
    expect(result.reachable).to.equal(true);
  });

  it("reports unreachable RPC providers without throwing", async () => {
    const service = new ChainHealthService(configured, {
      providerFactory: () => new FakeProvider(84532, 0, new Error("RPC unavailable")),
    });

    const result = await service.check("baseSepolia");

    expect(result.status).to.equal("unreachable");
    expect(result.configured).to.equal(true);
    expect(result.reachable).to.equal(false);
    expect(result.note).to.equal("RPC unavailable");
  });

  it("reports an enabled chain without a provider as misconfigured", async () => {
    const service = new ChainHealthService(configured);

    const result = await service.check("inkSepolia");

    expect(result.status).to.equal("misconfigured");
    expect(result.configured).to.equal(false);
    expect(result.reachable).to.equal(false);
    expect(result.note).to.contain("INK_SEPOLIA_RPC_URL");
  });

  it("does not probe disabled chains", async () => {
    let calls = 0;
    const service = new ChainHealthService(configured, {
      providerFactory: () => {
        calls += 1;
        return new FakeProvider(999);
      },
    });

    const result = await service.check("disabled");

    expect(result.status).to.equal("disabled");
    expect(calls).to.equal(0);
  });

  it("returns only ready chains from the configured matrix", async () => {
    const service = new ChainHealthService(configured, {
      providerFactory: (chain) => chain.key === "baseSepolia" ? new FakeProvider(84532) : undefined,
    });

    const ready = await service.readyChains();

    expect(ready.map((chain) => chain.chainKey)).to.deep.equal(["baseSepolia"]);
  });

  it("reports unknown chain keys without throwing", async () => {
    const service = new ChainHealthService(configured);

    const result = await service.check("missing");

    expect(result.status).to.equal("misconfigured");
    expect(result.enabled).to.equal(false);
    expect(result.note).to.equal("unknown chain: missing");
  });
});
