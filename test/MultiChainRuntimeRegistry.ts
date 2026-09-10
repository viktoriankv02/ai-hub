import { expect } from "chai";
import { ChainCapabilityRegistry } from "../agents/multi-chain/chain-capabilities.js";
import { ChainHealthService } from "../agents/multi-chain/chain-health.js";
import { MultiChainRuntimeRegistry } from "../agents/multi-chain/runtime-registry.js";
import type {
  ChainExecutionContext,
  MultiChainExecutionAdapter,
  UniversalAction,
  UniversalExecutionResult,
} from "../agents/multi-chain/types.js";
import type { ChainConfig } from "../config/chains.js";

const chains: ChainConfig[] = [
  { key: "baseSepolia", name: "Base Sepolia", kind: "evm", enabled: true, chainId: 84532 },
  { key: "inkSepolia", name: "Ink Sepolia", kind: "evm", enabled: true, chainId: 763373 },
  { key: "disabled", name: "Disabled", kind: "evm", enabled: false, chainId: 999 },
];

class StaticAdapter implements MultiChainExecutionAdapter {
  readonly id = "static-adapter";
  readonly chainKeys = new Set(["baseSepolia", "inkSepolia"]);
  supports(): boolean { return true; }
  execute(action: UniversalAction, context: ChainExecutionContext): UniversalExecutionResult {
    return { status: "success", actionId: action.id, chainKey: context.chainKey, timestamp: context.timestamp };
  }
}

function capabilityRegistry(): ChainCapabilityRegistry {
  const registry = new ChainCapabilityRegistry(chains);
  registry.register({ chainKey: "baseSepolia", actionKinds: new Set(["deploy-contract", "create-job"]) });
  registry.register({ chainKey: "inkSepolia", actionKinds: new Set(["deploy-contract"]) });
  registry.register({ chainKey: "disabled", actionKinds: new Set(["deploy-contract"]) });
  return registry;
}

function healthService(): ChainHealthService {
  return new ChainHealthService(chains, {
    providerFactory: (chain) => ({
      getChainId: () => chain.key === "inkSepolia" ? 1 : chain.chainId ?? 0,
      getBlockNumber: () => 100,
    }),
  });
}

describe("MultiChainRuntimeRegistry", () => {
  it("builds a complete runtime snapshot", async () => {
    const runtime = new MultiChainRuntimeRegistry(chains, {
      capabilityRegistry: capabilityRegistry(),
      healthService: healthService(),
    });
    runtime.registerAdapter(new StaticAdapter());
    runtime.setWalletState("baseSepolia", { connected: true, address: "0x123", gasAvailable: true });

    const snapshot = await runtime.snapshot("baseSepolia");

    expect(snapshot.ready).to.equal(true);
    expect(snapshot.executable).to.equal(true);
    expect(snapshot.adapterIds).to.deep.equal(["static-adapter"]);
    expect(snapshot.wallet).to.deep.equal({ connected: true, address: "0x123", gasAvailable: true });
    expect(snapshot.capabilities?.actionKinds.has("create-job")).to.equal(true);
    expect(snapshot.blockers).to.deep.equal([]);
  });

  it("marks a chain-id mismatch as non-executable", async () => {
    const runtime = new MultiChainRuntimeRegistry(chains, {
      capabilityRegistry: capabilityRegistry(),
      healthService: healthService(),
    });
    runtime.registerAdapter(new StaticAdapter());

    const snapshot = await runtime.snapshot("inkSepolia");

    expect(snapshot.ready).to.equal(false);
    expect(snapshot.executable).to.equal(false);
    expect(snapshot.blockers).to.include("health:chain-id-mismatch");
  });

  it("reports a missing adapter as an execution blocker", async () => {
    const runtime = new MultiChainRuntimeRegistry(chains, {
      capabilityRegistry: capabilityRegistry(),
      healthService: healthService(),
    });

    const snapshot = await runtime.snapshot("baseSepolia");

    expect(snapshot.ready).to.equal(true);
    expect(snapshot.executable).to.equal(false);
    expect(snapshot.blockers).to.include("execution-adapter-unavailable");
  });

  it("returns only executable chains supporting the requested action", async () => {
    const runtime = new MultiChainRuntimeRegistry(chains, {
      capabilityRegistry: capabilityRegistry(),
      healthService: healthService(),
    });
    runtime.registerAdapter(new StaticAdapter());

    const candidates = await runtime.candidates("create-job");

    expect(candidates.map((candidate) => candidate.chain.key)).to.deep.equal(["baseSepolia"]);
  });

  it("rejects wallet state for an unknown chain", () => {
    const runtime = new MultiChainRuntimeRegistry(chains);
    expect(() => runtime.setWalletState("unknown", { connected: true })).to.throw("unknown chain: unknown");
  });

  it("rejects an address on a disconnected wallet", () => {
    const runtime = new MultiChainRuntimeRegistry(chains);
    expect(() => runtime.setWalletState("baseSepolia", { connected: false, address: "0x123" }))
      .to.throw("disconnected wallet cannot expose an address");
  });
});
