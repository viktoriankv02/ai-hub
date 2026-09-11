import type { ProjectOpportunity } from "./types.js";
import type { DropTask, DropTaskKind, DropTaskRisk, TaskExtractionResult } from "./task-model.js";

const RULES: Array<{ pattern: RegExp; kind: DropTaskKind; risk: DropTaskRisk; automated: boolean; wallet: boolean; gas: boolean }> = [
  { pattern: /check[- ]?in|daily\s+(visit|claim|check)|weekly\s+(visit|claim|check)/i, kind: "check-in", risk: "low", automated: true, wallet: false, gas: false },
  { pattern: /faucet|testnet\s+tokens?|request\s+tokens?/i, kind: "faucet", risk: "low", automated: true, wallet: false, gas: false },
  { pattern: /follow|like|retweet|post|social|twitter|x\.com/i, kind: "social", risk: "low", automated: false, wallet: false, gas: false },
  { pattern: /discord|telegram|community|join/i, kind: "community", risk: "low", automated: false, wallet: false, gas: false },
  { pattern: /bridge|bridging/i, kind: "bridge", risk: "medium", automated: true, wallet: true, gas: true },
  { pattern: /swap|trade/i, kind: "swap", risk: "medium", automated: true, wallet: true, gas: true },
  { pattern: /liquidity|\blp\b|pool/i, kind: "liquidity", risk: "high", automated: true, wallet: true, gas: true },
  { pattern: /stake|staking/i, kind: "stake", risk: "high", automated: true, wallet: true, gas: true },
  { pattern: /deploy|developer|build|contract\s+deployment/i, kind: "deploy", risk: "medium", automated: true, wallet: true, gas: true },
  { pattern: /mint|nft|erc-?721|erc-?1155/i, kind: "mint", risk: "medium", automated: true, wallet: true, gas: true },
  { pattern: /interact\s+with\s+(a\s+)?contract|contract\s+interaction|call\s+(a\s+)?contract/i, kind: "contract-call", risk: "medium", automated: true, wallet: true, gas: true },
  { pattern: /quest|task|campaign|galxe|layer3|zealy/i, kind: "quest", risk: "low", automated: false, wallet: false, gas: false },
  { pattern: /verify|verification|attest|proof/i, kind: "verify", risk: "low", automated: true, wallet: false, gas: false },
  { pattern: /register\s+(the\s+)?chain|chain\s+registration/i, kind: "other", risk: "low", automated: true, wallet: true, gas: true },
  { pattern: /record\s+(verified\s+)?activity|log\s+activity/i, kind: "other", risk: "low", automated: true, wallet: true, gas: true },
  { pattern: /test\s+reward\s+flow|reward\s+flow/i, kind: "other", risk: "high", automated: true, wallet: true, gas: true },
];

export interface TaskExtractorOptions { source?: string; defaultDeadline?: string; }

export function extractDropTasks(opportunity: ProjectOpportunity, options: TaskExtractorOptions = {}): TaskExtractionResult {
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
      warnings.push(`No task classification rule matched action: ${title}`);
      tasks.push(makeTask(opportunity, title, { kind: "other", risk: "medium", automated: false, wallet: false, gas: false }, options));
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
    id: stableTaskId(opportunity.id, title), opportunityId: opportunity.id, title,
    description: `Complete the documented project action: ${title}`,
    kind: rule.kind, risk: rule.risk, automated: rule.automated,
    requiresWallet: rule.wallet, requiresGas: rule.gas,
    requiresUserApproval: rule.risk !== "low" || rule.wallet,
    rewardHint: opportunity.signals.rewardSignals !== undefined ? `Reward signal ${opportunity.signals.rewardSignals}/100` : undefined,
    deadline: options.defaultDeadline,
    recurrence: recurrenceFor(rule.kind, title),
    prerequisites: [], evidenceRequired: evidenceFor(rule.kind),
    source: options.source ?? opportunity.sources[0] ?? "opportunity",
  };
}

function recurrenceFor(kind: DropTaskKind, title: string): DropTask["recurrence"] {
  if (kind !== "check-in") return "once";
  if (/weekly/i.test(title)) return "weekly";
  if (/monthly/i.test(title)) return "monthly";
  return "daily";
}

function evidenceFor(kind: DropTaskKind): string[] {
  switch (kind) {
    case "social": case "community": case "quest": return ["external campaign proof or platform completion state"];
    case "check-in": case "faucet": return ["source completion state or response reference"];
    case "bridge": case "swap": case "liquidity": case "stake": case "deploy": case "mint": case "contract-call": return ["transaction hash", "target chain", "wallet address"];
    case "verify": return ["verification or attestation reference"];
    default: return ["source-defined completion evidence"];
  }
}

function stableTaskId(opportunityId: string, title: string): string {
  let hash = 2166136261;
  const value = `${opportunityId}:${title.trim().toLowerCase()}`;
  for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return `drop-task:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
