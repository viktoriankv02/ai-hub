import {
  DropHunterProductIngestionService,
  DropHunterProjectRepository,
  DropTaskAutomationPolicy,
  GitHubRepositoryOpportunitySource,
  JsonFileDropHunterProductStore,
  OpportunityDiscoveryRegistry,
  PRIORITY_OPPORTUNITIES,
  StaticOpportunitySource,
  type DiscoverySource,
} from "../agents/drop-hunter/index.js";
import { OfficialPageOpportunitySource, parseOfficialPagesJson } from "../agents/drop-hunter/official-page-opportunity-source.js";

const queries = (process.env.DROP_HUNTER_GITHUB_QUERIES ?? "incentivized testnet")
  .split(",")
  .map((query) => query.trim())
  .filter(Boolean);
const maxResults = Number(process.env.DROP_HUNTER_GITHUB_MAX_RESULTS ?? 10);
const minimumScore = Number(process.env.DROP_HUNTER_MIN_SCORE ?? 0);
const productStorePath = process.env.DROP_HUNTER_STORE_PATH ?? "data/drop-hunter-projects.json";
const maxAutonomousCostUsd = Number(process.env.DROP_HUNTER_MAX_AUTONOMOUS_COST_USD ?? 0);
const allowAutonomousGas = process.env.DROP_HUNTER_ALLOW_AUTONOMOUS_GAS === "true";
const allowAutonomousWallet = process.env.DROP_HUNTER_ALLOW_AUTONOMOUS_WALLET === "true";
const officialPages = parseOfficialPagesJson(process.env.DROP_HUNTER_OFFICIAL_PAGES_JSON);

if (queries.length === 0) throw new Error("DROP_HUNTER_GITHUB_QUERIES must contain at least one query");
if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100) throw new Error("DROP_HUNTER_GITHUB_MAX_RESULTS must be between 1 and 100");
if (!Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 100) throw new Error("DROP_HUNTER_MIN_SCORE must be between 0 and 100");
if (!Number.isFinite(maxAutonomousCostUsd) || maxAutonomousCostUsd < 0) throw new Error("DROP_HUNTER_MAX_AUTONOMOUS_COST_USD must be a non-negative number");

const sources: DiscoverySource[] = [
  new StaticOpportunitySource("priority-catalog", "AI Hub priority catalog", PRIORITY_OPPORTUNITIES),
  new GitHubRepositoryOpportunitySource({ queries, maxResults, token: process.env.GITHUB_TOKEN }),
];
if (officialPages.length > 0) sources.push(new OfficialPageOpportunitySource({ pages: officialPages }));
const discovery = new OpportunityDiscoveryRegistry(sources);

const store = new JsonFileDropHunterProductStore(productStorePath);
const repository = new DropHunterProjectRepository(store);
const automationPolicy = new DropTaskAutomationPolicy({
  maxAutonomousCostUsd,
  allowAutonomousGas,
  allowAutonomousWalletActions: allowAutonomousWallet,
});
const ingestion = new DropHunterProductIngestionService(discovery, repository, automationPolicy);
const report = await ingestion.ingest();
const visible = report.projects.filter((item) => item.intelligence.score.total >= minimumScore);

console.log("AI Hub Drop Hunter — product scan");
console.log(`Generated: ${report.discoveredAt}`);
console.log(`Discovered: ${report.discovery.opportunities.length}`);
console.log(`Shown (score >= ${minimumScore}): ${visible.length}`);
console.log(`Stored at: ${productStorePath}`);
console.log(`Official pages configured: ${officialPages.length}`);
console.log(`Successful sources: ${report.discovery.successfulSources.join(", ") || "none"}`);
if (report.discovery.failedSources.length > 0) {
  console.log(`Failed sources: ${report.discovery.failedSources.map((source) => `${source.sourceId}: ${source.error}`).join("; ")}`);
}
console.log("");

for (const [index, item] of visible.entries()) {
  const { opportunity } = item.intelligence;
  console.log(`${index + 1}. ${opportunity.name} | score=${item.intelligence.score.total} | confidence=${item.intelligence.score.confidence} | priority=${opportunity.priority}`);
  console.log(`   stage: ${opportunity.stage} | vm: ${opportunity.vm} | projectStatus=${item.project.status}`);
  console.log(`   tasks: ${item.tasks.length}`);
  for (const task of item.tasks) console.log(`   - ${task.title} | automation=${task.automation.mode} | ${task.automation.reasons.join("; ")}`);
  if (item.intelligence.score.reasons.length > 0) console.log(`   reasons: ${item.intelligence.score.reasons.join("; ")}`);
}

if (report.warnings.length > 0) {
  console.log("");
  console.log("Warnings:");
  for (const warning of report.warnings) console.log(`- ${warning}`);
}
