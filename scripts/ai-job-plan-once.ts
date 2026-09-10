import { resolve } from "node:path";
import {
  AIJobOrchestrator,
  JsonFileAIJobStore,
  planDropTaskJobs,
} from "../agents/ai-jobs/index.js";
import {
  DropHunterAgent,
  GitHubRepositoryOpportunitySource,
  StaticOpportunitySource,
  PRIORITY_OPPORTUNITIES,
} from "../agents/drop-hunter/index.js";

const agentId = process.env.AI_AGENT_ID ?? "1";
const reward = process.env.AI_JOB_REWARD ?? "0";
const minimumScore = Number(process.env.AI_JOB_MIN_SCORE ?? 30);
const includeApprovalRequired = process.env.AI_JOB_INCLUDE_APPROVAL === "true";
const storePath = resolve(process.env.AI_JOB_STORE ?? "./data/ai-jobs.json");
const githubQueries = (process.env.DROP_HUNTER_GITHUB_QUERIES ?? "incentivized testnet")
  .split(",")
  .map((query) => query.trim())
  .filter(Boolean);
const githubMaxResults = Number(process.env.DROP_HUNTER_GITHUB_MAX_RESULTS ?? 10);

if (!Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 100) {
  throw new Error("AI_JOB_MIN_SCORE must be between 0 and 100");
}
if (githubQueries.length === 0) {
  throw new Error("DROP_HUNTER_GITHUB_QUERIES must contain at least one query");
}
if (!Number.isInteger(githubMaxResults) || githubMaxResults < 1 || githubMaxResults > 100) {
  throw new Error("DROP_HUNTER_GITHUB_MAX_RESULTS must be between 1 and 100");
}

const hunter = new DropHunterAgent(
  [
    new StaticOpportunitySource("priority-catalog", "AI Hub priority catalog", PRIORITY_OPPORTUNITIES),
    new GitHubRepositoryOpportunitySource({
      queries: githubQueries,
      maxResults: githubMaxResults,
      token: process.env.GITHUB_TOKEN,
    }),
  ],
  { minimumScore: 0 },
);
const report = await hunter.scan();

const requests = planDropTaskJobs(report.results, {
  agentId,
  reward,
  minimumScore,
  includeApprovalRequired,
});

const store = new JsonFileAIJobStore(storePath);
const orchestrator = new AIJobOrchestrator(store);
const planned = requests.map((request) => orchestrator.enqueue(request));
const created = planned.filter((job) => job.createdAt === job.updatedAt).length;

console.log("AI Hub — Drop Hunter task planner");
console.log(`Agent: ${agentId}`);
console.log(`Reward: ${reward}`);
console.log(`Minimum score: ${minimumScore}`);
console.log(`Include approval-required tasks: ${includeApprovalRequired}`);
console.log(`Discovered opportunities: ${report.opportunities.length}`);
console.log(`Successful sources: ${report.successfulSources.join(", ") || "none"}`);
if (report.failedSources.length > 0) {
  console.log(`Failed sources: ${report.failedSources.map((source) => `${source.sourceId}: ${source.error}`).join("; ")}`);
}
console.log(`Structured tasks: ${report.results.reduce((sum, result) => sum + result.tasks.length, 0)}`);
console.log(`Eligible task jobs: ${requests.length}`);
console.log(`Queue entries returned: ${planned.length}`);
console.log(`Store: ${storePath}`);
console.log("");

for (const [index, job] of planned.entries()) {
  console.log(`${index + 1}. ${job.opportunityId ?? job.id}`);
  console.log(`   task: ${job.metadata?.taskId ?? "unknown"}`);
  console.log(`   kind: ${job.metadata?.taskKind ?? "unknown"}`);
  console.log(`   risk: ${job.metadata?.taskRisk ?? "unknown"}`);
  console.log(`   job: ${job.id}`);
  console.log(`   status: ${job.status}`);
  console.log(`   idempotency: ${job.idempotencyKey}`);
}

console.log("");
console.log(`Persisted new/updated queue entries: ${created}`);
