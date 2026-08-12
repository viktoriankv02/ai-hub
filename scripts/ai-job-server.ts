import { resolve } from "node:path";
import {
  AIJobHttpApi,
  AIJobOrchestrator,
  AIJobService,
  DryRunAIExecutor,
  JsonFileAIJobStore,
} from "../agents/ai-jobs/index.js";

const port = Number(process.env.AI_JOB_API_PORT ?? 8787);
const host = process.env.AI_JOB_API_HOST ?? "127.0.0.1";
const storePath = resolve(process.env.AI_JOB_STORE ?? "./data/ai-jobs.json");
const token = process.env.AI_JOB_API_TOKEN;
const batchSize = Number(process.env.AI_JOB_BATCH_SIZE ?? 5);
const maxAttempts = Number(process.env.AI_JOB_MAX_ATTEMPTS ?? 3);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("AI_JOB_API_PORT must be a valid TCP port");
}

const store = new JsonFileAIJobStore(storePath);
const orchestrator = new AIJobOrchestrator(store, { maxAttempts });
const service = new AIJobService(orchestrator, new DryRunAIExecutor(), { batchSize });
const api = new AIJobHttpApi(service, { token });
const server = api.createServer();

server.listen(port, host, () => {
  console.log("AI Hub — AI job control plane");
  console.log(`HTTP: http://${host}:${port}`);
  console.log(`Store: ${storePath}`);
  console.log(`Executor: dry-run`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Max attempts: ${maxAttempts}`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
