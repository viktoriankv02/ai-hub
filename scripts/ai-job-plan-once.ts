import { planTopOpportunityJobs } from "../agents/ai-jobs/index.js";
import { PRIORITY_OPPORTUNITIES, createReport } from "../agents/drop-hunter/index.js";

const report = createReport(PRIORITY_OPPORTUNITIES);
const agentId = process.env.AI_AGENT_ID ?? "1";
const reward = process.env.AI_JOB_REWARD ?? "0";
const jobs = planTopOpportunityJobs(report.opportunities, {
  agentId,
  reward,
  minimumScore: Number(process.env.AI_JOB_MIN_SCORE ?? 70),
});

console.log("AI Hub — AI job planner");
console.log(`Agent: ${agentId}`);
console.log(`Reward: ${reward}`);
console.log(`Source opportunities: ${report.opportunities.length}`);
console.log(`Planned jobs: ${jobs.length}`);
console.log("");

for (const [index, job] of jobs.entries()) {
  console.log(`${index + 1}. ${job.opportunityId}`);
  console.log(`   idempotency: ${job.idempotencyKey}`);
  console.log(`   taskHash: ${job.taskHash}`);
  console.log(`   reward: ${job.reward}`);
}
