import {
  DropHunterAgent,
  GitHubRepositoryOpportunitySource,
  PRIORITY_OPPORTUNITIES,
  StaticOpportunitySource,
} from "../agents/drop-hunter/index.js";

const queries = (process.env.DROP_HUNTER_GITHUB_QUERIES ?? "incentivized testnet")
  .split(",")
  .map((query) => query.trim())
  .filter(Boolean);
const maxResults = Number(process.env.DROP_HUNTER_GITHUB_MAX_RESULTS ?? 10);
const minimumScore = Number(process.env.DROP_HUNTER_MIN_SCORE ?? 0);

if (queries.length === 0) throw new Error("DROP_HUNTER_GITHUB_QUERIES must contain at least one query");
if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100) {
  throw new Error("DROP_HUNTER_GITHUB_MAX_RESULTS must be between 1 and 100");
}
if (!Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 100) {
  throw new Error("DROP_HUNTER_MIN_SCORE must be between 0 and 100");
}

const hunter = new DropHunterAgent(
  [
    new StaticOpportunitySource("priority-catalog", "AI Hub priority catalog", PRIORITY_OPPORTUNITIES),
    new GitHubRepositoryOpportunitySource({
      queries,
      maxResults,
      token: process.env.GITHUB_TOKEN,
    }),
  ],
  { minimumScore },
);

const report = await hunter.scan();

console.log("AI Hub Drop Hunter — live scan");
console.log(`Generated: ${report.generatedAt}`);
console.log(`Opportunities: ${report.results.length}`);
console.log(`Successful sources: ${report.successfulSources.join(", ") || "none"}`);
if (report.failedSources.length > 0) {
  console.log(`Failed sources: ${report.failedSources.map((source) => `${source.sourceId}: ${source.error}`).join("; ")}`);
}
console.log("");

for (const [index, result] of report.results.entries()) {
  console.log(
    `${index + 1}. ${result.opportunity.name} | score=${result.score.total} | confidence=${result.score.confidence} | priority=${result.opportunity.priority}`,
  );
  console.log(`   stage: ${result.opportunity.stage} | vm: ${result.opportunity.vm}`);
  console.log(`   tasks: ${result.tasks.length}`);
  if (result.tasks.length > 0) {
    for (const task of result.tasks) {
      console.log(`   - ${task.kind}: ${task.title} | risk=${task.risk} | approval=${task.requiresUserApproval}`);
    }
  }
  if (result.score.reasons.length > 0) {
    console.log(`   reasons: ${result.score.reasons.join("; ")}`);
  }
}
