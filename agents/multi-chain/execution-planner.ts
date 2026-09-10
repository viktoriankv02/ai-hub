import type { PlannedAction } from "../drop-hunter/action-planner.js";
import type { ScoredOpportunity } from "../drop-hunter/types.js";
import type { ChainConfig } from "../../config/chains.js";
import type { ChainSelectionPreferences, ChainSelectionResult } from "./chain-selector.js";
import { plannedActionToUniversalKind } from "./drop-hunter-action.js";
import type { UniversalActionKind } from "./types.js";

export type ExecutionPlanNodeStatus = "ready" | "blocked" | "completed" | "failed";

export interface ExecutionPlanSelector {
  select(
    actionKind: UniversalActionKind,
    preferences?: ChainSelectionPreferences,
  ): Promise<ChainSelectionResult>;
}

export interface ExecutionPlanNode {
  id: string;
  action: PlannedAction;
  actionKind: UniversalActionKind;
  dependencyIds: string[];
  chainKey?: string;
  status: ExecutionPlanNodeStatus;
  blockers: string[];
}

export interface MultiChainExecutionPlan {
  opportunityId: string;
  createdAt: string;
  nodes: ExecutionPlanNode[];
  executable: boolean;
  blockers: string[];
}

export interface MultiChainExecutionPlannerOptions {
  selector?: ExecutionPlanSelector;
  preferredChainKeys?: readonly string[];
  now?: () => Date;
}

const ACTION_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  "deploy-evm-adapter": ["deploy-core"],
  "register-chain": ["deploy-core", "deploy-evm-adapter"],
  "verify-configuration": ["register-chain"],
  "verify-contract": ["deploy-core"],
  "record-activity": ["register-chain"],
  "test-reward-flow": ["record-activity"],
};

function dependenciesFor(actionId: string, availableIds: ReadonlySet<string>): string[] {
  return (ACTION_DEPENDENCIES[actionId] ?? []).filter((dependencyId) => availableIds.has(dependencyId));
}

function resolveOpportunityChain(
  opportunity: ScoredOpportunity,
  chains: readonly ChainConfig[],
): string | undefined {
  if (opportunity.chainId === undefined) return undefined;
  return chains.find((chain) => chain.chainId === opportunity.chainId)?.key;
}

export class MultiChainExecutionPlanner {
  private readonly now: () => Date;

  constructor(
    private readonly chains: readonly ChainConfig[],
    private readonly options: MultiChainExecutionPlannerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async plan(
    opportunity: ScoredOpportunity,
    actions: readonly PlannedAction[],
  ): Promise<MultiChainExecutionPlan> {
    const availableIds = new Set(actions.map((action) => action.id));
    const fixedChainKey = resolveOpportunityChain(opportunity, this.chains);
    const nodes: ExecutionPlanNode[] = [];

    for (const action of actions) {
      const dependencyIds = dependenciesFor(action.id, availableIds);
      const actionKind = plannedActionToUniversalKind(action);
      const blockers: string[] = [];
      let chainKey = fixedChainKey;

      if (action.completed) {
        nodes.push({
          id: action.id,
          action,
          actionKind,
          dependencyIds,
          chainKey,
          status: "completed",
          blockers,
        });
        continue;
      }

      const incompleteDependencies = dependencyIds.filter((dependencyId) => {
        const dependency = nodes.find((node) => node.id === dependencyId);
        return dependency?.status !== "completed";
      });

      if (incompleteDependencies.length > 0) {
        blockers.push(...incompleteDependencies.map((dependencyId) => `dependency:${dependencyId}`));
      }

      if (!chainKey) {
        if (!this.options.selector) {
          blockers.push("chain-unresolved");
        } else {
          const selection = await this.options.selector.select(actionKind, {
            preferredChainKeys: this.options.preferredChainKeys,
            requireWallet: action.requiresWallet,
            requireGas: action.requiresGas,
          });
          chainKey = selection.selected?.chainKey;
          if (!chainKey) blockers.push(`no-chain-candidate:${actionKind}`);
        }
      }

      nodes.push({
        id: action.id,
        action,
        actionKind,
        dependencyIds,
        chainKey,
        status: blockers.length === 0 ? "ready" : "blocked",
        blockers,
      });
    }

    const blockers = nodes.flatMap((node) => node.blockers.map((blocker) => `${node.id}:${blocker}`));

    return {
      opportunityId: opportunity.id,
      createdAt: this.now().toISOString(),
      nodes,
      executable: nodes.every((node) => node.status === "ready" || node.status === "completed"),
      blockers,
    };
  }
}
