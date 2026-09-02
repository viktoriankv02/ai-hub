import { resolve } from "node:path";
import {
  AIJobHttpApi,
  AIJobOrchestrator,
  AIJobService,
  DryRunAIExecutor,
  JsonFileAIJobStore,
} from "../agents/ai-jobs/index.js";
import {
  DropHunterAgent,
  GitHubRepositoryOpportunitySource,
  StaticOpportunitySource,
  PRIORITY_OPPORTUNITIES,
} from "../agents/drop-hunter/index.js";

const port = Number(process.env.AI_JOB_API_PORT ?? 8787);
const host = process.env.AI_JOB_API_HOST ?? "127.0.0.1";
const storePath = resolve(process.env.AI_JOB_STORE ?? "./data/ai-jobs.json");
const token = process.env.AI_JOB_API_TOKEN;
const batchSize = Number(process.env.AI_JOB_BATCH_SIZE ?? 5);
const maxAttempts = Number(process.env.AI_JOB_MAX_ATTEMPTS ?? 3);
const minimumDropScore = Number(process.env.DROP_HUNTER_MIN_SCORE ?? 0);
const githubQueries = (process.env.DROP_HUNTER_GITHUB_QUERIES ?? "incentivized testnet")
  .split(",")
  .map((query) => query.trim())
  .filter(Boolean);
const githubMaxResults = Number(process.env.DROP_HUNTER_GITHUB_MAX_RESULTS ?? 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("AI_JOB_API_PORT must be a valid TCP port");
}
if (!Number.isFinite(minimumDropScore) || minimumDropScore < 0 || minimumDropScore > 100) {
  throw new Error("DROP_HUNTER_MIN_SCORE must be between 0 and 100");
}
if (!Number.isInteger(githubMaxResults) || githubMaxResults < 1 || githubMaxResults > 100) {
  throw new Error("DROP_HUNTER_GITHUB_MAX_RESULTS must be between 1 and 100");
}

const store = new JsonFileAIJobStore(storePath);
const orchestrator = new AIJobOrchestrator(store, { maxAttempts });
const service = new AIJobService(orchestrator, new DryRunAIExecutor(), { batchSize });
const dropHunterSources = [
  new StaticOpportunitySource("priority-catalog", "AI Hub priority catalog", PRIORITY_OPPORTUNITIES),
  new GitHubRepositoryOpportunitySource({
    queries: githubQueries,
    maxResults: githubMaxResults,
    token: process.env.GITHUB_TOKEN,
  }),
];
const dropHunter = new DropHunterAgent(dropHunterSources, { minimumScore: minimumDropScore });
const api = new AIJobHttpApi(service, { token, dropHunter });
const server = api.createServer();

server.listen(port, host, () => {
  console.log("AI Hub — AI job control plane");
  console.log(`HTTP: http://${host}:${port}`);
  console.log(`Store: ${storePath}`);
  console.log(`Executor: dry-run`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Max attempts: ${maxAttempts}`);
  console.log(`Drop Hunter minimum score: ${minimumDropScore}`);
  console.log(`GitHub discovery queries: ${githubQueries.join(", ")}`);
  console.log(`GitHub max results per query: ${githubMaxResults}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
