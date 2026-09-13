import type { AsyncOpportunitySource } from "./opportunity-source.js";
import type { OpportunityStage, ProjectOpportunity } from "./types.js";

export interface OfficialProjectPage {
  id: string;
  name: string;
  url: string;
  chainId?: number;
  vm?: ProjectOpportunity["vm"];
  priority?: number;
}

export interface OfficialPageResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type OfficialPageFetcher = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<OfficialPageResponse>;

export interface OfficialPageOpportunitySourceOptions {
  pages: readonly OfficialProjectPage[];
  timeoutMs?: number;
  fetcher?: OfficialPageFetcher;
}

const ACTIONS: Array<[RegExp, string]> = [
  [/check[- ]?in|daily visit|daily claim/i, "daily check-in"],
  [/faucet|request testnet tokens?/i, "faucet"],
  [/bridge|bridging/i, "bridge"],
  [/swap|trade/i, "swap"],
  [/liquidity|provide liquidity|liquidity pool/i, "liquidity"],
  [/stake|staking/i, "stake"],
  [/deploy.{0,30}(contract|token|nft)|developer.{0,30}deploy/i, "deploy contract"],
  [/mint.{0,20}nft|minting/i, "mint NFT"],
  [/verify.{0,20}contract|contract verification/i, "verify contract"],
  [/quest|campaign|galxe|layer3|zealy/i, "quest"],
];

export class OfficialPageOpportunitySource implements AsyncOpportunitySource {
  readonly id = "official-pages";
  readonly name = "Official project page discovery";
  private readonly pages: OfficialProjectPage[];
  private readonly timeoutMs: number;
  private readonly fetcher: OfficialPageFetcher;

  constructor(options: OfficialPageOpportunitySourceOptions) {
    this.pages = options.pages.map(validatePage);
    if (this.pages.length === 0) throw new Error("official page source requires at least one page");
    this.timeoutMs = options.timeoutMs ?? 12_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0) throw new Error("official page timeout must be a positive integer");
    this.fetcher = options.fetcher ?? ((url, init) => fetch(url, init));
  }

  async discover(): Promise<ProjectOpportunity[]> {
    const results = await Promise.allSettled(this.pages.map((page) => this.inspect(page)));
    const opportunities: ProjectOpportunity[] = [];
    for (const result of results) if (result.status === "fulfilled") opportunities.push(result.value);
    if (opportunities.length === 0) {
      const failures = results
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));
      throw new Error(`official page discovery failed: ${failures.join(" | ")}`);
    }
    return opportunities;
  }

  private async inspect(page: OfficialProjectPage): Promise<ProjectOpportunity> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(page.url, {
        signal: controller.signal,
        headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "AI-Hub-Drop-Hunter" },
      });
      if (!response.ok) throw new Error(`${page.name} returned HTTP ${response.status}`);
      const html = await response.text();
      const text = htmlToText(html).slice(0, 250_000);
      const stage = inferStage(text);
      const actions = inferActions(text);
      return {
        id: page.id,
        name: page.name,
        chainId: page.chainId,
        vm: page.vm ?? "EVM",
        stage,
        priority: Math.min(100, page.priority ?? 75),
        signals: inferSignals(text, stage, actions),
        sources: [page.url],
        actions: actions.length ? actions : ["verify"],
        notes: "Signals extracted from an explicitly configured official project page; reward language is evidence, not proof of eligibility.",
      };
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`${page.name} timed out after ${this.timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function parseOfficialPagesJson(value: string | undefined): OfficialProjectPage[] {
  if (!value?.trim()) return [];
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error("DROP_HUNTER_OFFICIAL_PAGES_JSON must be a JSON array");
  return parsed.map((page) => validatePage(page as OfficialProjectPage));
}

function validatePage(page: OfficialProjectPage): OfficialProjectPage {
  if (!page || typeof page !== "object") throw new Error("official page entry must be an object");
  if (typeof page.id !== "string" || !page.id.trim()) throw new Error("official page id is required");
  if (typeof page.name !== "string" || !page.name.trim()) throw new Error("official page name is required");
  if (typeof page.url !== "string" || !/^https:\/\//i.test(page.url)) throw new Error(`official page URL must use HTTPS: ${page.url}`);
  if (page.chainId !== undefined && (!Number.isInteger(page.chainId) || page.chainId <= 0)) throw new Error(`invalid chainId for ${page.id}`);
  return { ...page, id: page.id.trim(), name: page.name.trim(), url: page.url.trim() };
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function inferStage(text: string): OpportunityStage {
  if (/incentivized|points program|rewards program|airdrop/i.test(text)) return "incentivized";
  if (/testnet|devnet|test network|faucet/i.test(text)) return "testnet";
  if (/builder program|developer program|grants|hackathon/i.test(text)) return "builder-program";
  if (/mainnet|production network/i.test(text)) return "mainnet";
  return "research";
}

function inferActions(text: string): string[] {
  return [...new Set(ACTIONS.filter(([pattern]) => pattern.test(text)).map(([, action]) => action))];
}

function inferSignals(text: string, stage: OpportunityStage, actions: string[]): ProjectOpportunity["signals"] {
  return {
    developerProgram: /developer program|builder program|grants|hackathon/i.test(text) ? 85 : undefined,
    testnetActivity: stage === "testnet" ? 85 : undefined,
    mainnetReadiness: stage === "mainnet" ? 75 : undefined,
    onchainVerifiability: actions.some((action) => ["bridge", "swap", "liquidity", "stake", "deploy contract", "mint NFT"].includes(action)) ? 80 : undefined,
    ecosystemActivity: /ecosystem|community|partners|campaign/i.test(text) ? 70 : undefined,
    rewardSignals: /points program|rewards program|incentivized|airdrop/i.test(text) ? 80 : undefined,
    timing: /new|launch|now live|recent|season|epoch/i.test(text) ? 70 : undefined,
  };
}
