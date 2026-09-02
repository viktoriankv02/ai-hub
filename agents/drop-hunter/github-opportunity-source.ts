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
}

export interface GitHubSearchResponse {
  items?: unknown;
}

export type GitHubOpportunityFetcher = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface GitHubRepositoryOpportunitySourceOptions {
  queries: string[];
  maxResults?: number;
  timeoutMs?: number;
  token?: string;
  fetcher?: GitHubOpportunityFetcher;
}

const API = "https://api.github.com/search/repositories";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESULTS = 10;

const EVM_TERMS = [
  "evm", "ethereum", "solidity", "base", "arbitrum", "optimism", "polygon",
  "avalanche", "bnb", "chainlink", "foundry", "hardhat",
];

const ACTION_TERMS: Array<[string, string]> = [
  ["bridge", "bridge"],
  ["swap", "swap"],
  ["liquidity", "liquidity"],
  ["staking", "stake"],
  ["stake", "stake"],
  ["deploy", "deploy"],
  ["mint", "mint"],
  ["quest", "quest"],
  ["campaign", "quest"],
  ["galxe", "quest"],
  ["layer3", "quest"],
  ["verify", "verify"],
  ["discord", "community"],
  ["telegram", "community"],
  ["social", "social"],
  ["twitter", "social"],
];

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
    try {
      const results: ProjectOpportunity[] = [];
      for (const query of this.queries) {
        const url = new URL(API);
        url.searchParams.set("q", query);
        url.searchParams.set("sort", "updated");
        url.searchParams.set("order", "desc");
        url.searchParams.set("per_page", String(this.maxResults));

        const headers: Record<string, string> = {
          Accept: "application/vnd.github+json",
          "User-Agent": "AI-Hub-Drop-Hunter",
        };
        if (this.token) headers.Authorization = `Bearer ${this.token}`;

        const response = await this.fetcher(url.toString(), {
          method: "GET",
          headers,
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`GitHub repository search returned HTTP ${response.status}`);
        const payload = (await response.json()) as GitHubSearchResponse;
        if (!Array.isArray(payload.items)) throw new Error("GitHub repository search response has no items array");

        for (const item of payload.items) {
          const opportunity = toOpportunity(item);
          if (opportunity) results.push(opportunity);
        }
      }

      const byId = new Map(results.map((item) => [item.id, item]));
      return [...byId.values()].slice(0, this.maxResults * Math.max(1, this.queries.length));
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`GitHub discovery timed out after ${this.timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

function toOpportunity(item: GitHubRepositoryItem): ProjectOpportunity | undefined {
  const fullName = stringValue(item.full_name);
  const repoName = stringValue(item.name);
  const url = stringValue(item.html_url);
  if (!fullName || !repoName || !url) return undefined;

  const description = stringValue(item.description) ?? "";
  const topics = Array.isArray(item.topics) ? item.topics.filter((v): v is string => typeof v === "string") : [];
  const language = stringValue(item.language) ?? "";
  const text = `${fullName} ${repoName} ${description} ${topics.join(" ")} ${language}`.toLowerCase();

  const stage = inferStage(text);
  const actions = inferActions(text);
  const signals = inferSignals(text, stage, actions);
  const priority = Math.min(100, 20 + (stage === "incentivized" ? 20 : stage === "testnet" ? 15 : 0) + actions.length * 5);
  const updatedAt = stringValue(item.updated_at);
  const vm = EVM_TERMS.some((term) => text.includes(term)) ? "EVM" : "CUSTOM";

  return {
    id: `github:${fullName}`,
    name: repoName,
    vm,
    stage,
    priority,
    signals,
    sources: [url, `https://api.github.com/repos/${fullName}`],
    actions: actions.length > 0 ? actions : ["verify"],
    notes: `Discovered from public GitHub repository metadata; no reward or eligibility claim inferred.${updatedAt ? ` Repository updated ${updatedAt}.` : ""}`,
  };
}

function inferStage(text: string): OpportunityStage {
  if (/(incentivized|incentive|airdrop|points|rewards)/.test(text)) return "incentivized";
  if (/(testnet|test-net|devnet|faucet)/.test(text)) return "testnet";
  if (/(builder program|builders program|grants|hackathon)/.test(text)) return "builder-program";
  if (/(mainnet|main-net|production)/.test(text)) return "mainnet";
  return "research";
}

function inferActions(text: string): string[] {
  return [...new Set(ACTION_TERMS.filter(([term]) => text.includes(term)).map(([, action]) => action))];
}

function inferSignals(text: string, stage: OpportunityStage, actions: string[]): ProjectOpportunity["signals"] {
  const signals: ProjectOpportunity["signals"] = {
    testnetActivity: stage === "testnet" ? 80 : undefined,
    mainnetReadiness: stage === "mainnet" ? 70 : undefined,
    developerProgram: stage === "builder-program" ? 80 : undefined,
    rewardSignals: stage === "incentivized" ? 75 : undefined,
    onchainVerifiability: actions.some((action) => ["bridge", "swap", "liquidity", "stake", "deploy", "mint"].includes(action)) ? 70 : undefined,
    ecosystemActivity: /(community|discord|telegram|campaign|hackathon|ecosystem)/.test(text) ? 65 : undefined,
    timing: 50,
  };
  return signals;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
  return value;
}
