import { expect } from "chai";
import { chains } from "../config/chains.js";
import type { DropHunterCycleResult } from "../agents/drop-hunter/engine.js";
import type { PlannedAction } from "../agents/drop-hunter/action-planner.js";
import type { ScoredOpportunity } from "../agents/drop-hunter/types.js";
import {
  DropHunterUniversalDispatcher,
  UniversalActionRouter,
  type ChainExecutionContext,
  type MultiChainExecutionAdapter,
  type UniversalAction,
  type UniversalExecutionResult,
} from "../agents/multi-chain/index.js";

const opportunity: ScoredOpportunity = {
  id: "ink-builder-1",
  name: "Ink Builder Program",
  chainId: 763373,
  vm: "EVM",
  stage: "builder-program",
  priority: 10,
  signals: { developerProgram: 5, testnetActivity: 4 },
  sources: ["github"],
  actions: ["deploy core", "deploy erc20"],
  score: 84,
  confidence: 0.91,
  reasons: ["active builder target"],
};

const action: PlannedAction = {
  id: "deploy-core",
  label: "Deploy AI Hub core contracts",
  risk: "medium",
  requiresWallet: true,
  requiresGas: true,
  automated: true,
  completed: false,
};

const erc20Action: PlannedAction = {
  id: "deploy-erc20",
  label: "Deploy a minimal ERC20 test contract",
  risk: "medium",
  requiresWallet: true,
  requiresGas: true,
  automated: true,
  completed: false,
};

class RecordingUniversalAdapter implements MultiChainExecutionAdapter {
  readonly id = "recording-universal-adapter";
  readonly chainKeys = new Set(["inkSepolia"]);
  calls = 0;
  lastAction?: UniversalAction;
  lastContext?: ChainExecutionContext;

  supports(candidate: UniversalAction): boolean {
    return candidate.kind === "deploy-contract" && candidate.chainKey === "inkSepolia";
  }

  execute(candidate: UniversalAction, context: ChainExecutionContext): UniversalExecutionResult {
    this.calls += 1;
    this.lastAction = candidate;
    this.lastContext = context;
    return {
      status: "success",
      actionId: candidate.id,
      chainKey: candidate.chainKey,
      timestamp: context.timestamp,
      executionId: `execution-${this.calls}`,
    };
  }
}

describe("Drop Hunter universal dispatcher", () => {
  it("dispatches a planned action through the universal router", async () => {
    const adapter = new RecordingUniversalAdapter();
    const router = new UniversalActionRouter(chains, {
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    router.registerAdapter(adapter);
    const dispatcher = new DropHunterUniversalDispatcher(router, chains);
    const cycle = { opportunity, actions: [action] } as DropHunterCycleResult;

    const result = await dispatcher.dispatch(cycle, action, {
      context: { mode: "execute", walletConnected: true, walletAddress: "0x123", gasAvailable: true },
    });

    expect(result.status).to.equal("success");
    expect(result.actionId).to.equal("drop-hunter:ink-builder-1:deploy-core");
    expect(result.chainKey).to.equal("inkSepolia");
    expect(adapter.calls).to.equal(1);
    expect(adapter.lastAction?.payload).to.deep.include({
      opportunityId: "ink-builder-1",
      actionId: "deploy-core",
    });
    expect(adapter.lastContext?.chainId).to.equal(763373);
  });

  it("keeps dry-run side-effect free while still resolving the universal adapter", async () => {
    const adapter = new RecordingUniversalAdapter();
    const router = new UniversalActionRouter(chains);
    router.registerAdapter(adapter);
    const dispatcher = new DropHunterUniversalDispatcher(router, chains);
    const cycle = { opportunity, actions: [action] } as DropHunterCycleResult;

    const result = await dispatcher.dispatch(cycle, action, {
      context: { mode: "dry-run", walletConnected: true, walletAddress: "0x123", gasAvailable: true },
    });

    expect(result.status).to.equal("skipped");
    expect(result.note).to.contain("dry-run");
    expect(adapter.calls).to.equal(0);
  });

  it("dispatches multiple planned actions in order", async () => {
    const adapter = new RecordingUniversalAdapter();
    const router = new UniversalActionRouter(chains, {
      idempotency: false,
    });
    router.registerAdapter(adapter);
    const dispatcher = new DropHunterUniversalDispatcher(router, chains);
    const cycle = { opportunity, actions: [action, erc20Action] } as DropHunterCycleResult;

    const results = await dispatcher.dispatchAll(cycle, [action, erc20Action], {
      context: { mode: "execute", walletConnected: true, walletAddress: "0x123", gasAvailable: true },
    });

    expect(results).to.have.length(2);
    expect(results.map((item) => item.status)).to.deep.equal(["success", "success"]);
    expect(results.map((item) => item.actionId)).to.deep.equal([
      "drop-hunter:ink-builder-1:deploy-core",
      "drop-hunter:ink-builder-1:deploy-erc20",
    ]);
    expect(adapter.calls).to.equal(2);
  });
});
