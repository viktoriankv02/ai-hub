import type { ChainConfig } from "../../config/chains.js";
import type { PlannedAction } from "../drop-hunter/action-planner.js";
import type { ScoredOpportunity } from "../drop-hunter/types.js";
import type { UniversalAction, UniversalActionKind } from "./types.js";

export interface UniversalDropHunterAction extends UniversalAction {
  metadata: {
    opportunityId: string;
    opportunityName: string;
    risk: string;
    automated: string;
    [key: string]: string;
  };
}

function resolveChain(opportunity: ScoredOpportunity, chains: readonly ChainConfig[], chainKey?: string): ChainConfig {
  if (chainKey) {
    const explicit = chains.find((chain) => chain.key === chainKey);
    if (!explicit) throw new Error(`unknown chain: ${chainKey}`);
    return explicit;
  }

  if (opportunity.chainId === undefined) {
    throw new Error(`opportunity ${opportunity.id} does not define a chainId`);
  }

  const chain = chains.find((candidate) => candidate.chainId === opportunity.chainId);
  if (!chain) throw new Error(`no configured chain matches chainId ${opportunity.chainId}`);
  return chain;
}

export function plannedActionToUniversalKind(action: PlannedAction): UniversalActionKind {
  switch (action.id) {
    case "deploy-core":
    case "deploy-evm-adapter":
    case "deploy-erc20":
    case "deploy-nft":
      return "deploy-contract";
    case "verify-configuration":
    case "verify-contract":
      return "verify-contract";
    case "register-chain":
      return "custom";
    case "record-activity":
      return "custom";
    case "test-reward-flow":
      return "claim-reward";
    default:
      return "custom";
  }
}

export function toUniversalDropHunterAction(
  opportunity: ScoredOpportunity,
  action: PlannedAction,
  chains: readonly ChainConfig[],
  chainKey?: string,
): UniversalDropHunterAction {
  const chain = resolveChain(opportunity, chains, chainKey);

  return {
    id: `drop-hunter:${opportunity.id}:${action.id}`,
    kind: plannedActionToUniversalKind(action),
    chainKey: chain.key,
    payload: {
      opportunityId: opportunity.id,
      opportunityName: opportunity.name,
      actionId: action.id,
      label: action.label,
      risk: action.risk,
      automated: action.automated,
      opportunityScore: opportunity.score,
      opportunityConfidence: opportunity.confidence,
    },
    requiresWallet: action.requiresWallet,
    requiresGas: action.requiresGas,
    idempotencyKey: `drop-hunter:${opportunity.id}:${action.id}`,
    metadata: {
      opportunityId: opportunity.id,
      opportunityName: opportunity.name,
      risk: action.risk,
      automated: String(action.automated),
      chainId: String(chain.chainId ?? ""),
      vm: opportunity.vm,
    },
  };
}

export function toUniversalDropHunterActions(
  opportunity: ScoredOpportunity,
  actions: readonly PlannedAction[],
  chains: readonly ChainConfig[],
  chainKey?: string,
): UniversalDropHunterAction[] {
  return actions.map((action) => toUniversalDropHunterAction(opportunity, action, chains, chainKey));
}
