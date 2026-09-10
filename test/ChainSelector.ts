import { expect } from "chai";
import type { ChainConfig } from "../config/chains.js";
import {
  ChainCapabilityRegistry,
  ChainHealthService,
  ChainSelector,
  MultiChainRuntimeRegistry,
  type ChainExecutionContext,
  type MultiChainExecutionAdapter,
  type UniversalAction,
  type UniversalExecutionResult,
} from "../agents/multi-chain/index.js";

class StaticAdapter implements MultiChainExecutionAdapter {
  constructor(
    readonly id: string,
    readonly chainKeys: ReadonlySet<string>,
  ) {}

  supports(): boolean {
    return true;
  }

  execute(action: UniversalAction, context: ChainExecutionContext): UniversalExecutionResult {
    return {
      status: "success",
      actionId: action.id,
      chainKey: action.chainKey,
      timestamp: context.timestamp,
    };
  }
}

describe("ChainSelector", () => {
  const chains: ChainConfig[] = [
    { key: "alpha", name: "Alpha", kind: "evm", enabled: true, chainId: 1001 },
    { key: "beta", name: "Beta", kind: "evm", enabled: true, chainId: 1002 },
    { key: "gamma", name: "Gamma", kind: "evm", enabled: true, chainId: 1003 },
  ];

  function createRuntime() {
    const capabilities = new ChainCapabilityRegistry(chains);
    for (const chain of chains) {
      capabilities.register({ chainKey: chain.key, actionKinds: new Set(["deploy-contract", "custom"]) });
    }

    const health = new ChainHealthService(chains, {
      providerFactory: (chain) => ({
        getChainId: () => chain.chainId!,
        getBlockNumber: () => 123,
      }),
    });

    const runtime = new MultiChainRuntimeRegistry(chains, {
      capabilityRegistry: capabilities,
      healthService: health,
    });

    runtime.registerAdapter(new StaticAdapter("adapter", new Set(["alpha", "beta", "gamma"])));
    return runtime;
  }

  it("prefers a declared chain when candidates are otherwise equivalent", async () => {
    const runtime = createRuntime();
    const selector = new ChainSelector(runtime);

    const result = await selector.select("deploy-contract", {
      preferredChainKeys: ["beta", "alpha"],
    });

    expect(result.selected?.chainKey).to.equal("beta");
    expect(result.ranked.map((item) => item.chainKey)).to.deep.equal(["beta", "alpha", "gamma"]);
  });

  it("filters candidates that do not meet wallet requirements", async () => {
    const runtime = createRuntime();
    runtime.setWalletState("beta", { connected: true, address: "0xabc" });
    const selector = new ChainSelector(runtime);

    const result = await selector.select("deploy-contract", { requireWallet: true });

    expect(result.ranked.map((item) => item.chainKey)).to.deep.equal(["beta"]);
  });

  it("filters candidates that do not meet gas requirements", async () => {
    const runtime = createRuntime();
    runtime.setWalletState("alpha", { connected: true, address: "0x1", gasAvailable: false });
    runtime.setWalletState("gamma", { connected: true, address: "0x2", gasAvailable: true });
    const selector = new ChainSelector(runtime);

    const result = await selector.select("deploy-contract", { requireGas: true });

    expect(result.ranked.map((item) => item.chainKey)).to.deep.equal(["gamma"]);
  });

  it("boosts connected wallets and available gas by default", async () => {
    const runtime = createRuntime();
    runtime.setWalletState("alpha", { connected: true, address: "0x1", gasAvailable: true });
    const selector = new ChainSelector(runtime);

    const result = await selector.select("deploy-contract");

    expect(result.selected?.chainKey).to.equal("alpha");
    expect(result.selected?.reasons).to.include("wallet-connected");
    expect(result.selected?.reasons).to.include("gas-available");
  });

  it("uses chain key as a deterministic tie-breaker", async () => {
    const runtime = createRuntime();
    const selector = new ChainSelector(runtime);

    const ranked = await selector.rank("custom", {
      preferConnectedWallet: false,
      preferGasAvailable: false,
    });

    expect(ranked.map((item) => item.chainKey)).to.deep.equal(["alpha", "beta", "gamma"]);
  });

  it("returns no selection when no chain supports the requested action", async () => {
    const runtime = createRuntime();
    const selector = new ChainSelector(runtime);

    const result = await selector.select("bridge");

    expect(result.selected).to.equal(undefined);
    expect(result.ranked).to.deep.equal([]);
  });
});
