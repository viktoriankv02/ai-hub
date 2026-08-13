import { resolve } from "node:path";
import {
  AIJobOrchestrator,
  JsonFileAIJobStore,
  planTopOpportunityJobs,
} from "../agents/ai-jobs/index.js";
import { PRIORITY_OPPORTUNITIES, createReport } from "../agents/drop-hunter/index.js";

const report = createReport(PRIORITY_OPPORTUNITIES);
const agentId = process.env.AI_AGENT_ID ?? "1";
const reward = process.env.AI_JOB_REWARD ?? "0";
const minimumScore = Number(process.env.AI_JOB_MIN_SCORE ?? 30);
const storePath = resolve(process.env.AI_JOB_STORE ?? "./data/ai-jobs.json");

const requests = planTopOpportunityJobs(report.opportunities, {
  agentId,
  reward,
  minimumScore,
});

const store = new JsonFileAIJobStore(storePath);
const orchestrator = new AIJobOrchestrator(store);

const planned = requests.map((request) => orchestrator.enqueue(request));
const created = planned.filter((job) => job.createdAt === job.updatedAt).length;

console.log("AI Hub — AI job planner");
console.log(`Agent: ${agentId}`);
console.log(`Reward: ${reward}`);
console.log(`Minimum score: ${minimumScore}`);
console.log(`Source opportunities: ${report.opportunities.length}`);
console.log(`Eligible job requests: ${requests.length}`);
console.log(`Queue entries returned: ${planned.length}`);
console.log(`Store: ${storePath}`);
console.log("");

for (const [index, job] of planned.entries()) {
  console.log(`${index + 1}. ${job.opportunityId ?? job.id}`);
  console.log(`   job: ${job.id}`);
  console.log(`   status: ${job.status}`);
  console.log(`   idempotency: ${job.idempotencyKey}`);
  console.log(`   taskHash: ${job.taskHash}`);
  console.log(`   reward: ${job.reward}`);
}

console.log("");
console.log(`Persisted new/updated queue entries: ${created}`);
