import { expect } from "chai";
import { ChainCapabilityRegistry } from "../agents/multi-chain/chain-capabilities.js";
import { UniversalActionRouter } from "../agents/multi-chain/router.js";
import { ChainHealthService, type ChainHealthProvider } from "../agents/multi-chain/chain-health.js";
import type {
  ChainExecutionContext,
  MultiChainExecutionAdapter,
  UniversalAction,
} from "../agents/multi-chain/types.js";
import type { ChainConfig } from "../config/chains.js";

class RecordingAdapter implements MultiChainExecutionAdapter {
  readonly id = "recording";
  readonly chainKeys = new Set(["baseSepolia", "inkSepolia"]);
  calls = 0;

  supports(action: UniversalAction): boolean {
    return action.kind === "custom";
  }

  async execute(action: UniversalAction, context: ChainExecutionContext) {
    this.calls += 1;
    return {
      status: "success" as const,
      actionId: action.id,
      chainKey: context.chainKey,
      timestamp: context.timestamp,
      executionId: `exec:${this.calls}`,
      note: "recorded",
    };
  }
}

class StaticHealthProvider implements ChainHealthProvider {
  constructor(private readonly chainId: number, private readonly blockNumber = 123) {}

  getChainId(): number {
    return this.chainId;
  }

  getBlockNumber(): number {
    return this.blockNumber;
  }
}

describe("UniversalActionRouter", function () {
  const chains: ChainConfig[] = [
    { key: "baseSepolia", name: "Base Sepolia", kind: "evm", enabled: true, chainId: 84532 },
    { key: "inkSepolia", name: "Ink Sepolia", kind: "evm", enabled: true, chainId: 763373 },
    { key: "disabled", name: "Disabled", kind: "evm", enabled: false, chainId: 999 },
  ];

  const action = (overrides: Partial<UniversalAction> = {}): UniversalAction => ({
    id: "action-1",
    kind: "custom",
    chainKey: "baseSepolia",
    payload: { value: 1 },
    ...overrides,
  });

  it("resolves an adapter by both chain and action capability", async function () {
    const router = new UniversalActionRouter(chains, { now: () => new Date("2026-01-01T00:00:00.000Z") });
    const adapter = new RecordingAdapter();
    router.registerAdapter(adapter);

    const result = await router.execute(action(), { mode: "dry-run" });

    expect(result.status).to.equal("skipped");
    expect(result.note).to.contain("resolved adapter recording");
    expect(adapter.calls).to.equal(0);
  });

  it("executes through a resolved adapter in execute mode", async function () {
    const router = new UniversalActionRouter(chains, { now: () => new Date("2026-01-01T00:00:00.000Z") });
    const adapter = new RecordingAdapter();
    router.registerAdapter(adapter);

    const result = await router.execute(action(), { mode: "execute" });

    expect(result.status).to.equal("success");
    expect(result.executionId).to.equal("exec:1");
    expect(result.chainKey).to.equal("baseSepolia");
    expect(adapter.calls).to.equal(1);
  });

  it("rejects disabled chains before adapter execution", async function () {
    const router = new UniversalActionRouter(chains);
    const adapter = new RecordingAdapter();
    router.registerAdapter(adapter);

    const result = await router.execute(action({ chainKey: "disabled" }), { mode: "execute" });

    expect(result.status).to.equal("failed");
    expect(result.note).to.equal("chain is disabled: disabled");
    expect(adapter.calls).to.equal(0);
  });

  it("rejects wallet-required actions without a connected wallet", async function () {
    const router = new UniversalActionRouter(chains);
    const adapter = new RecordingAdapter();
    router.registerAdapter(adapter);

    const result = await router.execute(action({ requiresWallet: true }), { mode: "execute" });

    expect(result.status).to.equal("failed");
    expect(result.note).to.equal("wallet connection is required");
  });

  it("coalesces successful execute calls by idempotency key", async function () {
    const router = new UniversalActionRouter(chains, { now: () => new Date("2026-01-01T00:00:00.000Z") });
    const adapter = new RecordingAdapter();
    router.registerAdapter(adapter);
    const request = action({ idempotencyKey: "builder:base-sepolia:custom:1" });

    const first = await router.execute(request, { mode: "execute" });
    const second = await router.execute(request, { mode: "execute" });

    expect(first.status).to.equal("success");
    expect(second.status).to.equal("skipped");
    expect(second.note).to.equal("idempotent action already completed");
    expect(adapter.calls).to.equal(1);
  });

  it("can clear an idempotency key for a deliberate retry", async function () {
    const router = new UniversalActionRouter(chains);
    const adapter = new RecordingAdapter();
    router.registerAdapter(adapter);
    const request = action({ idempotencyKey: "retry-me" });

    await router.execute(request, { mode: "execute" });
    expect(router.clearIdempotencyKey("retry-me")).to.equal(true);
    const retried = await router.execute(request, { mode: "execute" });

    expect(retried.status).to.equal("success");
    expect(adapter.calls).to.equal(2);
  });

  it("allows execution when chain health is ready", async function () {
    const health = new ChainHealthService(chains, {
      providerFactory: (chain) => chain.key === "baseSepolia" ? new StaticHealthProvider(84532, 456) : undefined,
    });
    const router = new UniversalActionRouter(chains, { healthService: health });
    const adapter = new RecordingAdapter();
    router.registerAdapter(adapter);

    const result = await router.execute(action(), { mode: "execute" });

    expect(result.status).to.equal("success");
    expect(adapter.calls).to.equal(1);
  });

  it("blocks execution when chain health reports a chain-id mismatch", async function () {
    const health = new ChainHealthService(chains, {
      providerFactory: (chain) => chain.key === "baseSepolia" ? new StaticHealthProvider(1) : undefined,
    });
    const router = new UniversalActionRouter(chains, { healthService: health });
    const adapter = new RecordingAdapter();
    router.registerAdapter(adapter);

    const result = await router.execute(action(), { mode: "execute" });

    expect(result.status).to.equal("failed");
    expect(result.note).to.contain("chain is not ready: baseSepolia (chain-id-mismatch)");
    expect(adapter.calls).to.equal(0);
  });

  it("blocks execution when chain health is unreachable", async function () {
    const health = new ChainHealthService(chains, {
      providerFactory: (chain) => chain.key === "baseSepolia"
        ? { getChainId: async () => { throw new Error("rpc unavailable"); } }
        : undefined,
    });
    const router = new UniversalActionRouter(chains, { healthService: health });
    const adapter = new RecordingAdapter();
    router.registerAdapter(adapter);

    const result = await router.execute(action(), { mode: "execute" });

    expect(result.status).to.equal("failed");
    expect(result.note).to.equal("chain is not ready: baseSepolia (unreachable) — rpc unavailable");
    expect(adapter.calls).to.equal(0);
  });

  it("blocks an undeclared capability before health or adapter execution", async function () {
    let healthCalls = 0;
    const capabilities = new ChainCapabilityRegistry(chains);
    capabilities.register({
      chainKey: "baseSepolia",
      actionKinds: new Set(["custom"]),
    });
    const health = new ChainHealthService(chains, {
      providerFactory: () => ({
        getChainId: () => {
          healthCalls += 1;
          return 84532;
        },
      }),
    });
    const router = new UniversalActionRouter(chains, {
      capabilityRegistry: capabilities,
      healthService: health,
    });
    const adapter = new RecordingAdapter();
    router.registerAdapter(adapter);

    const result = await router.execute(action({ kind: "swap" }), { mode: "execute" });

    expect(result.status).to.equal("failed");
    expect(result.note).to.equal("action swap is not enabled for baseSepolia");
    expect(healthCalls).to.equal(0);
    expect(adapter.calls).to.equal(0);
  });

  it("passes an explicitly enabled capability into health and execution", async function () {
    const capabilities = new ChainCapabilityRegistry(chains);
    capabilities.register({
      chainKey: "baseSepolia",
      actionKinds: new Set(["custom"]),
    });
    const health = new ChainHealthService(chains, {
      providerFactory: () => new StaticHealthProvider(84532),
    });
    const router = new UniversalActionRouter(chains, {
      capabilityRegistry: capabilities,
      healthService: health,
    });
    const adapter = new RecordingAdapter();
    router.registerAdapter(adapter);

    const result = await router.execute(action(), { mode: "execute" });

    expect(result.status).to.equal("success");
    expect(adapter.calls).to.equal(1);
  });
});
