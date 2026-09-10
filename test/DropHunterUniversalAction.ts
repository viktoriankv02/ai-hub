import { expect } from "chai";
import { chains } from "../config/chains.js";
import type { PlannedAction } from "../agents/drop-hunter/action-planner.js";
import type { ScoredOpportunity } from "../agents/drop-hunter/types.js";
import {
  toUniversalDropHunterAction,
  toUniversalDropHunterActions,
} from "../agents/multi-chain/drop-hunter-action.js";

const opportunity: ScoredOpportunity = {
  id: "ink-builder-1",
  name: "Ink Builder Program",
  chainId: 763373,
  vm: "EVM",
  stage: "builder-program",
  priority: 10,
  signals: { developerProgram: 5, testnetActivity: 4 },
  sources: ["github"],
  actions: ["deploy core", "verify configuration"],
  score: 84,
  confidence: 0.91,
  reasons: ["active builder target"],
};

const deployCore: PlannedAction = {
  id: "deploy-core",
  label: "Deploy AI Hub core contracts",
  risk: "medium",
  requiresWallet: true,
  requiresGas: true,
  automated: true,
  completed: false,
};

const verifyConfiguration: PlannedAction = {
  id: "verify-configuration",
  label: "Verify the deployed configuration on-chain",
  risk: "low",
  requiresWallet: true,
  requiresGas: false,
  automated: true,
  completed: false,
};

describe("Drop Hunter universal action mapping", () => {
  it("derives the configured chain from an opportunity chainId", () => {
    const action = toUniversalDropHunterAction(opportunity, deployCore, chains);

    expect(action.chainKey).to.equal("inkSepolia");
    expect(action.kind).to.equal("deploy-contract");
    expect(action.requiresWallet).to.equal(true);
    expect(action.requiresGas).to.equal(true);
    expect(action.idempotencyKey).to.equal("drop-hunter:ink-builder-1:deploy-core");
    expect(action.metadata.chainId).to.equal("763373");
    expect(action.metadata.risk).to.equal("medium");
  });

  it("maps all planned actions without changing their execution requirements", () => {
    const actions = toUniversalDropHunterActions(
      opportunity,
      [deployCore, verifyConfiguration],
      chains,
    );

    expect(actions).to.have.length(2);
    expect(actions[0].kind).to.equal("deploy-contract");
    expect(actions[1].kind).to.equal("verify-contract");
    expect(actions[0].requiresGas).to.equal(true);
    expect(actions[1].requiresGas).to.equal(false);
    expect(actions[0].chainKey).to.equal(actions[1].chainKey);
  });

  it("accepts an explicit chain key when the opportunity has no chainId", () => {
    const chainless = { ...opportunity, chainId: undefined };
    const action = toUniversalDropHunterAction(
      chainless,
      deployCore,
      chains,
      "baseSepolia",
    );

    expect(action.chainKey).to.equal("baseSepolia");
  });

  it("rejects unknown explicit chains", () => {
    expect(() =>
      toUniversalDropHunterAction(opportunity, deployCore, chains, "missing-chain"),
    ).to.throw("unknown chain: missing-chain");
  });

  it("rejects opportunities without a chain when no explicit chain is supplied", () => {
    const chainless = { ...opportunity, chainId: undefined };

    expect(() =>
      toUniversalDropHunterAction(chainless, deployCore, chains),
    ).to.throw("opportunity ink-builder-1 does not define a chainId");
  });
});
