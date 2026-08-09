import type { ProjectOpportunity, ScoredOpportunity } from "./types.js";

export type ExecutionRisk = "low" | "medium" | "high";

export interface UserExecutionProfile {
  completedActionIds?: string[];
  preferredRisk?: ExecutionRisk;
}

export interface PlannedAction {
  id: string;
  label: string;
  risk: ExecutionRisk;
  requiresWallet: boolean;
  requiresGas: boolean;
  automated: boolean;
  completed: boolean;
}

const ACTIONS: Record<string, Omit<PlannedAction, "completed">> = {
  "deploy core": {
    id: "deploy-core",
    label: "Deploy AI Hub core contracts",
    risk: "medium",
    requiresWallet: true,
    requiresGas: true,
    automated: true,
  },
  "deploy evm adapter": {
    id: "deploy-evm-adapter",
    label: "Deploy and register the EVM chain adapter",
    risk: "medium",
    requiresWallet: true,
    requiresGas: true,
    automated: true,
  },
  "register chain": {
    id: "register-chain",
    label: "Register the target chain in ChainRegistry",
    risk: "low",
    requiresWallet: true,
    requiresGas: true,
    automated: true,
  },
  "verify configuration": {
    id: "verify-configuration",
    label: "Verify the deployed configuration on-chain",
    risk: "low",
    requiresWallet: true,
    requiresGas: false,
    automated: true,
  },
  "deploy erc20": {
    id: "deploy-erc20",
    label: "Deploy a minimal ERC20 test contract",
    risk: "medium",
    requiresWallet: true,
    requiresGas: true,
    automated: true,
  },
  "deploy nft": {
    id: "deploy-nft",
    label: "Deploy a minimal NFT test contract",
    risk: "medium",
    requiresWallet: true,
    requiresGas: true,
    automated: true,
  },
  "verify contract": {
    id: "verify-contract",
    label: "Verify the deployed contract in the explorer",
    risk: "low",
    requiresWallet: false,
    requiresGas: false,
    automated: false,
  },
  "record activity": {
    id: "record-activity",
    label: "Record a verifiable on-chain activity in AI Hub",
    risk: "low",
    requiresWallet: true,
    requiresGas: true,
    automated: true,
  },
  "test reward flow": {
    id: "test-reward-flow",
    label: "Execute the reward flow and verify the resulting state",
    risk: "high",
    requiresWallet: true,
    requiresGas: true,
    automated: true,
  },
};

function normalizeAction(action: string): string {
  return action.trim().toLowerCase();
}

function riskRank(risk: ExecutionRisk): number {
  return risk === "low" ? 0 : risk === "medium" ? 1 : 2;
}

export function planOpportunity(
  opportunity: ProjectOpportunity | ScoredOpportunity,
  profile: UserExecutionProfile = {},
): PlannedAction[] {
  const completed = new Set(profile.completedActionIds ?? []);
  const preferredRisk = profile.preferredRisk;

  return opportunity.actions
    .map(normalizeAction)
    .filter((action, index, all) => all.indexOf(action) === index)
    .map((action) => ACTIONS[action])
    .filter((action): action is Omit<PlannedAction, "completed"> => Boolean(action))
    .filter((action) => !preferredRisk || riskRank(action.risk) <= riskRank(preferredRisk))
    .map((action) => ({ ...action, completed: completed.has(action.id) }));
}

export function planTopOpportunities(
  opportunities: ScoredOpportunity[],
  profile: UserExecutionProfile = {},
): Array<{ opportunity: ScoredOpportunity; actions: PlannedAction[] }> {
  return opportunities.map((opportunity) => ({
    opportunity,
    actions: planOpportunity(opportunity, profile),
  }));
}
