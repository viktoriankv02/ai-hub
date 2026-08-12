import { resolve } from "node:path";
import {
  AIJobHttpApi,
  AIJobOrchestrator,
  AIJobScheduler,
  AIJobService,
  DryRunAIExecutor,
  JsonFileAIJobSchedulerStateStore,
  JsonFileAIJobStore,
} from "../agents/ai-jobs/index.js";

const intervalMs = Number(process.env.AI_JOB_WORKER_INTERVAL_MS ?? 30_000);
const batchSize = Number(process.env.AI_JOB_BATCH_SIZE ?? 5);
const maxAttempts = Number(process.env.AI_JOB_MAX_ATTEMPTS ?? 3);
const jobStorePath = resolve(process.env.AI_JOB_STORE ?? "./data/ai-jobs.json");
const schedulerStatePath = resolve(
  process.env.AI_JOB_SCHEDULER_STATE ?? "./data/ai-job-scheduler.json",
);

if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
  throw new Error("AI_JOB_WORKER_INTERVAL_MS must be a positive finite number");
}

const jobStore = new JsonFileAIJobStore(jobStorePath);
const orchestrator = new AIJobOrchestrator(jobStore, { maxAttempts });
const service = new AIJobService(orchestrator, new DryRunAIExecutor(), { batchSize });
const stateStore = new JsonFileAIJobSchedulerStateStore(schedulerStatePath);

const scheduler = new AIJobScheduler(service, {
  intervalMs,
  stateStore,
  onCycle: (cycle) => {
    console.log(
      `[AIJobWorker] ${cycle.timestamp} processed=${cycle.processed.length} skipped=${cycle.skipped.length}`,
    );
  },
  onError: (error) => {
    console.error("[AIJobWorker] tick failed:", error);
  },
});

await scheduler.startAsync(true);

console.log("AI Hub — persistent AI job worker");
console.log(`Interval: ${intervalMs}ms`);
console.log(`Batch size: ${batchSize}`);
console.log(`Max attempts: ${maxAttempts}`);
console.log(`Job store: ${jobStorePath}`);
console.log(`Scheduler state: ${schedulerStatePath}`);
console.log("Executor: dry-run");

const shutdown = () => {
  scheduler.stop();
  console.log("AI job worker stopped");
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
