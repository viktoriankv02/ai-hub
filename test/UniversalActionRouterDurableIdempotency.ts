import { expect } from "chai";
import { DurableExecutionLedger, MemoryExecutionLedgerStore } from "../agents/multi-chain/execution-ledger.js";
import { UniversalActionRouter } from "../agents/multi-chain/router.js";
import type {
  ChainExecutionContext,
  MultiChainExecutionAdapter,
  UniversalAction,
} from "../agents/multi-chain/types.js";
import type { ChainConfig } from "../config/chains.js";

class Adapter implements MultiChainExecutionAdapter {
  readonly id = "durable";
  readonly chainKeys = new Set(["baseSepolia"]);
  calls = 0;
  throwNext = false;
  withTxHash = false;

  supports(action: UniversalAction): boolean {
    return action.kind === "custom";
  }

  async execute(action: UniversalAction, context: ChainExecutionContext) {
    this.calls += 1;
    if (this.throwNext) {
      this.throwNext = false;
      throw new Error("adapter boom");
    }
    return {
      status: "success" as const,
      actionId: action.id,
      chainKey: context.chainKey,
      timestamp: context.timestamp,
      executionId: `exec:${this.calls}`,
      ...(this.withTxHash ? { txHash: `0x${String(this.calls).padStart(64, "0")}` } : {}),
    };
  }
}

describe("UniversalActionRouter durable idempotency", function () {
  const chains: ChainConfig[] = [
    { key: "baseSepolia", name: "Base Sepolia", kind: "evm", enabled: true, chainId: 84532 },
  ];

  const request = (): UniversalAction => ({
    id: "action-1",
    kind: "custom",
    chainKey: "baseSepolia",
    payload: {},
    idempotencyKey: "durable:key:1",
  });

  it("persists a successful no-tx execution as confirmed and suppresses duplicates", async function () {
    const ledger = new DurableExecutionLedger(new MemoryExecutionLedgerStore(), () => new Date("2026-01-01T00:00:00.000Z"));
    const router = new UniversalActionRouter(chains, { executionLedger: ledger });
    const adapter = new Adapter();
    router.registerAdapter(adapter);

    const first = await router.execute(request(), { mode: "execute" });
    const second = await router.execute(request(), { mode: "execute" });

    expect(first.status).to.equal("success");
    expect(second.status).to.equal("skipped");
    expect(second.note).to.equal("idempotent action not executed: already-confirmed");
    expect(adapter.calls).to.equal(1);
    expect((await ledger.get("durable:key:1"))?.status).to.equal("confirmed");
  });

  it("treats successful transaction submission as in-flight until reconciliation", async function () {
    const ledger = new DurableExecutionLedger(new MemoryExecutionLedgerStore());
    const router = new UniversalActionRouter(chains, { executionLedger: ledger });
    const adapter = new Adapter();
    adapter.withTxHash = true;
    router.registerAdapter(adapter);

    const first = await router.execute(request(), { mode: "execute" });
    const second = await router.execute(request(), { mode: "execute" });

    expect(first.status).to.equal("success");
    expect(second.status).to.equal("skipped");
    expect(second.note).to.equal("idempotent action not executed: in-flight");
    expect((await ledger.get("durable:key:1"))?.status).to.equal("submitted");
    expect(adapter.calls).to.equal(1);
  });

  it("marks thrown adapter executions failed and permits a deliberate retry", async function () {
    const ledger = new DurableExecutionLedger(new MemoryExecutionLedgerStore());
    const router = new UniversalActionRouter(chains, { executionLedger: ledger });
    const adapter = new Adapter();
    adapter.throwNext = true;
    router.registerAdapter(adapter);

    const failed = await router.execute(request(), { mode: "execute" });
    const retried = await router.execute(request(), { mode: "execute" });

    expect(failed.status).to.equal("failed");
    expect(failed.note).to.equal("adapter boom");
    expect(retried.status).to.equal("success");
    expect(adapter.calls).to.equal(2);
    expect((await ledger.get("durable:key:1"))?.attempts).to.equal(2);
    expect((await ledger.get("durable:key:1"))?.status).to.equal("confirmed");
  });

  it("can clear a durable idempotency key explicitly", async function () {
    const ledger = new DurableExecutionLedger(new MemoryExecutionLedgerStore());
    const router = new UniversalActionRouter(chains, { executionLedger: ledger });
    const adapter = new Adapter();
    router.registerAdapter(adapter);

    await router.execute(request(), { mode: "execute" });
    expect(await router.clearDurableIdempotencyKey("durable:key:1")).to.equal(true);
    const retried = await router.execute(request(), { mode: "execute" });

    expect(retried.status).to.equal("success");
    expect(adapter.calls).to.equal(2);
  });
});
