import { expect } from "chai";
import type { PlannedAction } from "../agents/drop-hunter/action-planner.js";
import type { ScoredOpportunity } from "../agents/drop-hunter/types.js";
import {
  MultiChainExecutionPlanner,
  type ChainSelectionPreferences,
  type ChainSelectionResult,
  type UniversalActionKind,
} from "../agents/multi-chain/index.js";
import type { ChainConfig } from "../config/chains.js";

const chains: ChainConfig[] = [
  { key: "baseSepolia", name: "Base Sepolia", kind: "evm", enabled: true, chainId: 84532 },
  { key: "inkSepolia", name: "Ink Sepolia", kind: "evm", enabled: true, chainId: 763373 },
];

const opportunity = (chainId?: number): ScoredOpportunity => ({
  id: "planner-opportunity",
  name: "Planner Opportunity",
  chainId,
  vm: "EVM",
  stage: "builder-program",
  priority: 10,
  signals: {},
  sources: ["github"],
  actions: [],
  score: 90,
  confidence: 0.9,
  reasons: ["test"],
});

const planned = (
  id: string,
  overrides: Partial<PlannedAction> = {},
): PlannedAction => ({
  id,
  label: id,
  risk: "low",
  requiresWallet: false,
  requiresGas: false,
  automated: true,
  completed: false,
  ...overrides,
});

class KindSelector {
  calls: Array<{ kind: UniversalActionKind; preferences?: ChainSelectionPreferences }> = [];

  async select(
    kind: UniversalActionKind,
    preferences?: ChainSelectionPreferences,
  ): Promise<ChainSelectionResult> {
    this.calls.push({ kind, preferences });
    const chainKey = kind === "verify-contract" ? "inkSepolia" : "baseSepolia";
    return {
      actionKind: kind,
      selected: {
        chainKey,
        score: 100,
        reasons: ["test-selection"],
        snapshot: {} as never,
      },
      ranked: [],
    };
  }
}

describe("MultiChainExecutionPlanner", () => {
  it("keeps an opportunity-defined chain fixed across actions", async () => {
    const planner = new MultiChainExecutionPlanner(chains);
    const result = await planner.plan(opportunity(763373), [
      planned("deploy-core"),
      planned("deploy-erc20"),
    ]);

    expect(result.nodes.map((node) => node.chainKey)).to.deep.equal(["inkSepolia", "inkSepolia"]);
    expect(result.nodes.every((node) => node.status === "ready")).to.equal(true);
    expect(result.executable).to.equal(true);
  });

  it("selects chains independently for chainless actions", async () => {
    const selector = new KindSelector();
    const planner = new MultiChainExecutionPlanner(chains, { selector });
    const result = await planner.plan(opportunity(), [
      planned("deploy-erc20"),
      planned("verify-contract"),
    ]);

    expect(result.nodes[0].chainKey).to.equal("baseSepolia");
    expect(result.nodes[1].chainKey).to.equal("inkSepolia");
    expect(selector.calls.map((call) => call.kind)).to.deep.equal(["deploy-contract", "verify-contract"]);
  });

  it("passes wallet and gas requirements into chain selection", async () => {
    const selector = new KindSelector();
    const planner = new MultiChainExecutionPlanner(chains, { selector, preferredChainKeys: ["inkSepolia"] });

    await planner.plan(opportunity(), [
      planned("deploy-erc20", { requiresWallet: true, requiresGas: true }),
    ]);

    expect(selector.calls[0].preferences).to.deep.equal({
      preferredChainKeys: ["inkSepolia"],
      requireWallet: true,
      requireGas: true,
    });
  });

  it("blocks an action until its declared dependency is completed", async () => {
    const planner = new MultiChainExecutionPlanner(chains);
    const result = await planner.plan(opportunity(763373), [
      planned("deploy-core"),
      planned("deploy-evm-adapter"),
    ]);

    expect(result.nodes[0].status).to.equal("ready");
    expect(result.nodes[1].status).to.equal("blocked");
    expect(result.nodes[1].blockers).to.deep.equal(["dependency:deploy-core"]);
    expect(result.executable).to.equal(false);
  });

  it("releases a dependency when the prerequisite is already completed", async () => {
    const planner = new MultiChainExecutionPlanner(chains);
    const result = await planner.plan(opportunity(763373), [
      planned("deploy-core", { completed: true }),
      planned("deploy-evm-adapter"),
    ]);

    expect(result.nodes[0].status).to.equal("completed");
    expect(result.nodes[1].status).to.equal("ready");
    expect(result.executable).to.equal(true);
  });

  it("reports a controlled blocker when no chain selector is available", async () => {
    const planner = new MultiChainExecutionPlanner(chains, {
      now: () => new Date("2026-09-10T12:00:00.000Z"),
    });
    const result = await planner.plan(opportunity(), [planned("deploy-erc20")]);

    expect(result.createdAt).to.equal("2026-09-10T12:00:00.000Z");
    expect(result.nodes[0].status).to.equal("blocked");
    expect(result.nodes[0].blockers).to.deep.equal(["chain-unresolved"]);
    expect(result.blockers).to.deep.equal(["deploy-erc20:chain-unresolved"]);
  });
});
