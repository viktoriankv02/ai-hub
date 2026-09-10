import { expect } from "chai";
import type { DropHunterCycleResult } from "../agents/drop-hunter/engine.js";
import type { PlannedAction } from "../agents/drop-hunter/action-planner.js";
import type { ScoredOpportunity } from "../agents/drop-hunter/types.js";
import {
  DropHunterUniversalDispatcher,
  UniversalActionRouter,
  type ChainExecutionContext,
  type ChainSelectionPreferences,
  type ChainSelectionResult,
  type DropHunterChainSelector,
  type MultiChainExecutionAdapter,
  type UniversalAction,
  type UniversalActionKind,
  type UniversalExecutionResult,
} from "../agents/multi-chain/index.js";
import type { ChainConfig } from "../config/chains.js";

const chains: ChainConfig[] = [
  { key: "baseSepolia", name: "Base Sepolia", kind: "evm", enabled: true, chainId: 84532 },
  { key: "inkSepolia", name: "Ink Sepolia", kind: "evm", enabled: true, chainId: 763373 },
];

const opportunity: ScoredOpportunity = {
  id: "chainless-builder",
  name: "Chainless Builder Opportunity",
  chainId: undefined,
  vm: "EVM",
  stage: "builder-program",
  priority: 9,
  signals: { developerProgram: 5, testnetActivity: 4 },
  sources: ["github"],
  actions: ["deploy core"],
  score: 81,
  confidence: 0.88,
  reasons: ["builder opportunity without a fixed chain"],
};

const deployAction: PlannedAction = {
  id: "deploy-core",
  label: "Deploy AI Hub core contracts",
  risk: "medium",
  requiresWallet: true,
  requiresGas: true,
  automated: true,
  completed: false,
};

class RecordingSelector implements DropHunterChainSelector {
  calls = 0;
  lastKind?: UniversalActionKind;
  lastPreferences?: ChainSelectionPreferences;

  constructor(private readonly selectedChainKey?: string) {}

  async select(
    actionKind: UniversalActionKind,
    preferences: ChainSelectionPreferences = {},
  ): Promise<ChainSelectionResult> {
    this.calls += 1;
    this.lastKind = actionKind;
    this.lastPreferences = preferences;

    if (!this.selectedChainKey) return { actionKind, ranked: [] };

    const chain = chains.find((candidate) => candidate.key === this.selectedChainKey)!;
    const snapshot = {
      chain,
      adapterIds: ["recording"],
      wallet: { connected: true, address: "0x123", gasAvailable: true },
      ready: true,
      executable: true,
      blockers: [],
    };

    return {
      actionKind,
      selected: {
        chainKey: this.selectedChainKey,
        score: 100,
        reasons: ["test-selection"],
        snapshot,
      },
      ranked: [{
        chainKey: this.selectedChainKey,
        score: 100,
        reasons: ["test-selection"],
        snapshot,
      }],
    };
  }
}

class BaseDeployAdapter implements MultiChainExecutionAdapter {
  readonly id = "base-deploy";
  readonly chainKeys = new Set(["baseSepolia", "inkSepolia"]);
  calls = 0;
  lastAction?: UniversalAction;

  supports(action: UniversalAction): boolean {
    return action.kind === "deploy-contract";
  }

  execute(action: UniversalAction, context: ChainExecutionContext): UniversalExecutionResult {
    this.calls += 1;
    this.lastAction = action;
    return {
      status: "success",
      actionId: action.id,
      chainKey: action.chainKey,
      timestamp: context.timestamp,
      executionId: `exec-${this.calls}`,
    };
  }
}

function createCycle(currentOpportunity: ScoredOpportunity = opportunity): DropHunterCycleResult {
  return { opportunity: currentOpportunity, actions: [deployAction] } as DropHunterCycleResult;
}

describe("Drop Hunter automatic chain selection", () => {
  it("selects a chain for a chainless opportunity and preserves action requirements", async () => {
    const selector = new RecordingSelector("baseSepolia");
    const adapter = new BaseDeployAdapter();
    const router = new UniversalActionRouter(chains);
    router.registerAdapter(adapter);
    const dispatcher = new DropHunterUniversalDispatcher(router, chains, selector);

    const result = await dispatcher.dispatch(createCycle(), deployAction, {
      context: { mode: "execute", walletConnected: true, walletAddress: "0x123", gasAvailable: true },
    });

    expect(result.status).to.equal("success");
    expect(result.chainKey).to.equal("baseSepolia");
    expect(selector.calls).to.equal(1);
    expect(selector.lastKind).to.equal("deploy-contract");
    expect(selector.lastPreferences?.requireWallet).to.equal(true);
    expect(selector.lastPreferences?.requireGas).to.equal(true);
    expect(adapter.lastAction?.chainKey).to.equal("baseSepolia");
  });

  it("does not invoke the selector when the opportunity already defines a chainId", async () => {
    const selector = new RecordingSelector("baseSepolia");
    const adapter = new BaseDeployAdapter();
    const router = new UniversalActionRouter(chains);
    router.registerAdapter(adapter);
    const dispatcher = new DropHunterUniversalDispatcher(router, chains, selector);
    const fixed = { ...opportunity, chainId: 763373 };

    const result = await dispatcher.dispatch(createCycle(fixed), deployAction, {
      context: { mode: "execute", walletConnected: true, walletAddress: "0x123", gasAvailable: true },
    });

    expect(result.status).to.equal("success");
    expect(result.chainKey).to.equal("inkSepolia");
    expect(selector.calls).to.equal(0);
  });

  it("lets an explicit chainKey override automatic selection", async () => {
    const selector = new RecordingSelector("baseSepolia");
    const adapter = new BaseDeployAdapter();
    const router = new UniversalActionRouter(chains);
    router.registerAdapter(adapter);
    const dispatcher = new DropHunterUniversalDispatcher(router, chains, selector);

    const result = await dispatcher.dispatch(createCycle(), deployAction, {
      chainKey: "inkSepolia",
      context: { mode: "execute", walletConnected: true, walletAddress: "0x123", gasAvailable: true },
    });

    expect(result.status).to.equal("success");
    expect(result.chainKey).to.equal("inkSepolia");
    expect(selector.calls).to.equal(0);
  });

  it("returns a controlled failure when no executable chain candidate exists", async () => {
    const selector = new RecordingSelector();
    const router = new UniversalActionRouter(chains);
    const dispatcher = new DropHunterUniversalDispatcher(router, chains, selector);

    const result = await dispatcher.dispatch(createCycle(), deployAction, {
      context: { mode: "execute", walletConnected: true, walletAddress: "0x123", gasAvailable: true },
    });

    expect(result.status).to.equal("failed");
    expect(result.chainKey).to.equal("unresolved");
    expect(result.note).to.equal("no executable chain candidate for deploy-contract");
  });

  it("returns a controlled failure when a chainless opportunity has no selector", async () => {
    const router = new UniversalActionRouter(chains);
    const dispatcher = new DropHunterUniversalDispatcher(router, chains);

    const result = await dispatcher.dispatch(createCycle(), deployAction);

    expect(result.status).to.equal("failed");
    expect(result.note).to.contain("no chain selector is configured");
  });
});
