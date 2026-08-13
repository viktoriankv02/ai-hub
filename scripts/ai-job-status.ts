import "dotenv/config";
import { resolve } from "node:path";
import { JsonFileAIJobStore } from "../agents/ai-jobs/index.js";
import { JsonOnchainJobBindingStore } from "../agents/ai-jobs/onchain-job-bindings.js";
import { JsonCompletionPublicationStore } from "../agents/ai-jobs/completion-store.js";

const jobStorePath = resolve(process.env.AI_JOB_STORE ?? "./data/ai-jobs.json");
const bindingStorePath = resolve(process.env.AI_ONCHAIN_BINDINGS_STORE ?? "./data/onchain-job-bindings.json");
const completionStorePath = resolve(process.env.AI_JOB_COMPLETION_STORE ?? "./data/ai-job-completions.json");

const jobs = new JsonFileAIJobStore(jobStorePath).list();
const bindings = new JsonOnchainJobBindingStore(bindingStorePath);
const publications = new JsonCompletionPublicationStore(completionStorePath);

const counts = jobs.reduce<Record<string, number>>((result, job) => {
  result[job.status] = (result[job.status] ?? 0) + 1;
  return result;
}, {});

const onchainBound = jobs.filter((job) => bindings.has(job.id)).length;
const published = jobs.filter((job) => publications.get(job.id) !== undefined).length;

console.log(JSON.stringify({
  jobStore: jobStorePath,
  bindingStore: bindingStorePath,
  completionStore: completionStorePath,
  totalJobs: jobs.length,
  byStatus: counts,
  onchainBound,
  completionPublished: published,
  generatedAt: new Date().toISOString(),
}, null, 2));
