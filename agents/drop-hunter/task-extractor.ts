import type { ProjectOpportunity } from "./types.js";
import type { DropTask, DropTaskKind, DropTaskRisk, TaskExtractionResult } from "./task-model.js";

const RULES: Array<{ pattern: RegExp; kind: DropTaskKind; risk: DropTaskRisk; automated: boolean; wallet: boolean; gas: boolean }> = [
  { pattern: /follow|like|retweet|post|social|twitter|x\.com/i, kind: "social", risk: "low", automated: false, wallet: false, gas: false },
  { pattern: /discord|telegram|community|join/i, kind: "community", risk: "low", automated: false, wallet: false, gas: false },
  { pattern: /bridge|bridging/i, kind: "bridge", risk: "medium", automated: true, wallet: true, gas: true },
  { pattern: /swap|trade/i, kind: "swap", risk: "medium", automated: true, wallet: true, gas: true },
  { pattern: /liquidity|lp|pool/i, kind: "liquidity", risk: "high", automated: true, wallet: true, gas: true },
  { pattern: /stake|staking/i, kind: "stake", risk: "high", automated: true, wallet: true, gas: true },
  { pattern: /deploy|developer|build|contract/i, kind: "deploy", risk: "medium", automated: true, wallet: true, gas: true },
  { pattern: /mint|nft|erc-?721|erc-?1155/i, kind: "mint", risk: "medium", automated: true, wallet: true, gas: true },
  { pattern: /quest|task|campaign|galxe|layer3|zealy/i, kind: "quest", risk: "low", automated: false, wallet: false, gas: false },
  { pattern: /verify|verification|attest|proof/i, kind: "verify", risk: "low", automated: false, wallet: false, gas: false },
];

export interface TaskExtractorOptions {
  source?: string;
  defaultDeadline?: string;
}

export function extractDropTasks(
  opportunity: ProjectOpportunity,
  options: TaskExtractorOptions = {},
): TaskExtractionResult {
  const warnings: string[] = [];
  const tasks: DropTask[] = [];
  const seen = new Set<string>();

  for (const rawAction of opportunity.actions) {
    const title = rawAction.trim();
    if (!title) continue;
    const normalized = title.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const rule = RULES.find((candidate) => candidate.pattern.test(title));
    if (!rule) {
      warnings.push(`No execution rule matched action: ${title}`);
      tasks.push(makeTask(opportunity, title, {
        kind: "other",
        risk: "medium",
        automated: false,
        wallet: false,
        gas: false,
      }, options));
      continue;
    }

    tasks.push(makeTask(opportunity, title, {
      kind: rule.kind,
      risk: rule.risk,
      automated: rule.automated,
      wallet: rule.wallet,
      gas: rule.gas,
    }, options));
  }

  if (tasks.length === 0) warnings.push("Opportunity has no actionable tasks.");
  return { tasks, warnings };
}

function makeTask(
  opportunity: ProjectOpportunity,
  title: string,
  rule: { kind: DropTaskKind; risk: DropTaskRisk; automated: boolean; wallet: boolean; gas: boolean },
  options: TaskExtractorOptions,
): DropTask {
  return {
    id: stableTaskId(opportunity.id, title),
    opportunityId: opportunity.id,
    title,
    description: `Complete the documented project action: ${title}`,
    kind: rule.kind,
    risk: rule.risk,
    automated: rule.automated,
    requiresWallet: rule.wallet,
    requiresGas: rule.gas,
    requiresUserApproval: rule.risk !== "low" || rule.wallet,
    rewardHint: opportunity.signals.rewardSignals !== undefined
      ? `Reward signal ${opportunity.signals.rewardSignals}/100`
      : undefined,
    deadline: options.defaultDeadline,
    prerequisites: [],
    evidenceRequired: evidenceFor(rule.kind),
    source: options.source ?? opportunity.sources[0] ?? "opportunity",
  };
}

function evidenceFor(kind: DropTaskKind): string[] {
  switch (kind) {
    case "social":
    case "community":
    case "quest":
      return ["external campaign proof or platform completion state"];
    case "bridge":
    case "swap":
    case "liquidity":
    case "stake":
    case "deploy":
    case "mint":
      return ["transaction hash", "target chain", "wallet address"];
    case "verify":
      return ["verification or attestation reference"];
    default:
      return ["source-defined completion evidence"];
  }
}

function stableTaskId(opportunityId: string, title: string): string {
  let hash = 2166136261;
  const value = `${opportunityId}:${title.trim().toLowerCase()}`;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `drop-task:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
