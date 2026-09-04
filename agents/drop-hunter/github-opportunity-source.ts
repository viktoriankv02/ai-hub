import type { AsyncOpportunitySource } from "./opportunity-source.js";
import type { ProjectOpportunity, OpportunityStage } from "./types.js";

export interface GitHubRepositoryItem {
  full_name?: unknown;
  name?: unknown;
  html_url?: unknown;
  description?: unknown;
  topics?: unknown;
  language?: unknown;
  updated_at?: unknown;
  stargazers_count?: unknown;
  forks_count?: unknown;
  archived?: unknown;
  disabled?: unknown;
  fork?: unknown;
}

export interface GitHubSearchResponse { items?: unknown; }
export interface GitHubResponse { ok: boolean; status: number; headers?: { get(name: string): string | null }; json(): Promise<unknown>; }
export type GitHubOpportunityFetcher = (input: string, init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<GitHubResponse>;
export interface GitHubRepositoryOpportunitySourceOptions { queries: string[]; maxResults?: number; timeoutMs?: number; token?: string; fetcher?: GitHubOpportunityFetcher; }

const API = "https://api.github.com/search/repositories";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESULTS = 10;
const EVM_TERMS = ["evm", "ethereum", "solidity", "base", "arbitrum", "optimism", "polygon", "avalanche", "bnb", "chainlink", "foundry", "hardhat"];
const ACTION_TERMS: Array<[string, string]> = [["bridge", "bridge"], ["swap", "swap"], ["liquidity", "liquidity"], ["staking", "stake"], ["stake", "stake"], ["deploy", "deploy"], ["mint", "mint"], ["quest", "quest"], ["campaign", "quest"], ["galxe", "quest"], ["layer3", "quest"], ["verify", "verify"], ["discord", "community"], ["telegram", "community"], ["social", "social"], ["twitter", "social"]];
const NOISE_TERMS = [/auto.?bot/i, /trading.?bot/i, /sniper/i, /tracker/i, /airdrop.?bot/i, /farm.?bot/i, /telegram.?bot/i];
const PROJECT_TERMS = [/protocol/i, /network/i, /chain/i, /testnet/i, /mainnet/i, /developer/i, /sdk/i, /contracts?/i, /bridge/i, /dex/i, /defi/i, /infrastructure/i, /ecosystem/i];

export class GitHubRepositoryOpportunitySource implements AsyncOpportunitySource {
  readonly id = "github-repositories";
  readonly name = "GitHub repository discovery";
  private readonly queries: string[];
  private readonly maxResults: number;
  private readonly timeoutMs: number;
  private readonly token?: string;
  private readonly fetcher: GitHubOpportunityFetcher;

  constructor(options: GitHubRepositoryOpportunitySourceOptions) {
    this.queries = [...new Set(options.queries.map((q) => q.trim()).filter(Boolean))];
    if (this.queries.length === 0) throw new Error("At least one GitHub discovery query is required");
    this.maxResults = positiveInteger(options.maxResults ?? DEFAULT_MAX_RESULTS, "GitHub maxResults");
    this.timeoutMs = positiveInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, "GitHub timeoutMs");
    this.token = options.token?.trim() || undefined;
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  }

  async discover(): Promise<ProjectOpportunity[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const results: ProjectOpportunity[] = [];
    const failures: string[] = [];
    try {
      for (const query of this.queries) {
        try {
          const response = await this.search(query, controller.signal);
          const payload = (await response.json()) as GitHubSearchResponse;
          if (!Array.isArray(payload.items)) throw new Error("GitHub repository search response has no items array");
          for (const item of payload.items) {
            const opportunity = toOpportunity(item);
            if (opportunity) results.push(opportunity);
          }
        } catch (error) {
          if (controller.signal.aborted) throw new Error(`GitHub discovery timed out after ${this.timeoutMs}ms`);
          failures.push(`${query}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (results.length === 0 && failures.length > 0) throw new Error(`All GitHub discovery queries failed: ${failures.join(" | ")}`);
      return [...new Map(results.map((item) => [item.id, item])).values()].slice(0, this.maxResults * Math.max(1, this.queries.length));
    } finally { clearTimeout(timer); }
  }

  private async search(query: string, signal: AbortSignal): Promise<GitHubResponse> {
    const url = new URL(API);
    url.searchParams.set("q", query); url.searchParams.set("sort", "updated"); url.searchParams.set("order", "desc"); url.searchParams.set("per_page", String(this.maxResults));
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "AI-Hub-Drop-Hunter" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const response = await this.fetcher(url.toString(), { method: "GET", headers, signal });
    if (!response.ok) throw githubHttpError(response);
    return response;
  }
}

function githubHttpError(response: GitHubResponse): Error {
  const status = response.status;
  if (status === 403 || status === 429) {
    const retryAfter = response.headers?.get("retry-after"); const reset = response.headers?.get("x-ratelimit-reset"); const details: string[] = [];
    if (retryAfter) details.push(`Retry-After=${retryAfter}s`);
    if (reset && Number.isFinite(Number(reset))) details.push(`rate-limit-reset=${new Date(Number(reset) * 1000).toISOString()}`);
    return new Error(`GitHub repository search rate limited (HTTP ${status})${details.length ? `; ${details.join(", ")}` : ""}`);
  }
  return new Error(`GitHub repository search returned HTTP ${status}`);
}

function toOpportunity(item: GitHubRepositoryItem): ProjectOpportunity | undefined {
  const fullName = stringValue(item.full_name); const repoName = stringValue(item.name); const url = stringValue(item.html_url);
  if (!fullName || !repoName || !url || item.archived === true || item.disabled === true || item.fork === true) return undefined;
  const description = stringValue(item.description) ?? "";
  const topics = Array.isArray(item.topics) ? item.topics.filter((v): v is string => typeof v === "string") : [];
  const language = stringValue(item.language) ?? "";
  const text = `${fullName} ${repoName} ${description} ${topics.join(" ")} ${language}`.toLowerCase();
  if (NOISE_TERMS.some((term) => term.test(text)) && !PROJECT_TERMS.some((term) => term.test(text))) return undefined;
  const stage = inferStage(text); const actions = inferActions(text); const signals = inferSignals(text, stage, actions, stringValue(item.updated_at));
  const stars = numberValue(item.stargazers_count); const forks = numberValue(item.forks_count);
  const credibility = Math.min(15, Math.round(Math.log10(1 + stars) * 4 + Math.log10(1 + forks) * 2));
  const priority = Math.min(100, 15 + credibility + (stage === "incentivized" ? 20 : stage === "testnet" ? 15 : stage === "builder-program" ? 12 : 0) + actions.length * 5 + (EVM_TERMS.some((term) => text.includes(term)) ? 8 : 0));
  const vm = EVM_TERMS.some((term) => text.includes(term)) ? "EVM" : "CUSTOM";
  return { id: `github:${fullName}`, name: repoName, vm, stage, priority, signals, sources: [url, `https://api.github.com/repos/${fullName}`], actions: actions.length > 0 ? actions : ["verify"], notes: `Public GitHub metadata only. Reward signals are keyword-derived evidence, not claims of eligibility or payout.${stars !== undefined ? ` Stars: ${stars}.` : ""}${forks !== undefined ? ` Forks: ${forks}.` : ""}` };
}

function inferStage(text: string): OpportunityStage {
  if (/(incentivized|incentive|airdrop|points|rewards)/.test(text)) return "incentivized";
  if (/(testnet|test-net|devnet|faucet)/.test(text)) return "testnet";
  if (/(builder program|builders program|grants|hackathon)/.test(text)) return "builder-program";
  if (/(mainnet|main-net|production)/.test(text)) return "mainnet";
  return "research";
}
function inferActions(text: string): string[] { return [...new Set(ACTION_TERMS.filter(([term]) => text.includes(term)).map(([, action]) => action))]; }
function inferSignals(text: string, stage: OpportunityStage, actions: string[], updatedAt?: string): ProjectOpportunity["signals"] {
  const explicitReward = /(airdrop|points|rewards|reward)/.test(text); const incentiveProgram = /(incentivized|incentive)/.test(text);
  return { testnetActivity: stage === "testnet" ? 80 : undefined, mainnetReadiness: stage === "mainnet" ? 70 : undefined, developerProgram: stage === "builder-program" ? 80 : undefined, rewardSignals: explicitReward ? 75 : incentiveProgram ? 60 : undefined, onchainVerifiability: actions.some((a) => ["bridge", "swap", "liquidity", "stake", "deploy", "mint"].includes(a)) ? 70 : undefined, ecosystemActivity: /(community|discord|telegram|campaign|hackathon|ecosystem)/.test(text) ? 65 : undefined, timing: inferTimingSignal(updatedAt) };
}
function inferTimingSignal(updatedAt?: string): number | undefined {
  if (!updatedAt) return undefined;
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) return undefined;
  const ageMs = Date.now() - timestamp;
  if (ageMs < 0) return 100;
  const ageDays = ageMs / 86_400_000;
  if (ageDays <= 1) return 100;
  if (ageDays <= 7) return 75;
  if (ageDays <= 30) return 50;
  if (ageDays <= 90) return 25;
  return undefined;
}
function stringValue(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function numberValue(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined; }
function positiveInteger(value: number, label: string): number { if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`); return value; }
