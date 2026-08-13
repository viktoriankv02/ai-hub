import { createCompletionReceipt, verifyCompletionReceipt } from "../agents/ai-jobs/completion-receipt.js";
import type { AIJobRecord } from "../agents/ai-jobs/types.js";

const job: AIJobRecord = {
  id: `smoke-${Date.now()}`,
  agentId: "local-agent",
  taskHash: "sha256:task-smoke",
  prompt: "AI Hub completion receipt smoke test",
  reward: "0",
  trigger: "manual",
  status: "completed",
  attempts: 1,
  createdAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  resultHash: "sha256:result-smoke",
};

const output = "AI Hub receipt smoke passed";
const receipt = createCompletionReceipt(job, output);

if (!verifyCompletionReceipt(job, receipt, output)) {
  throw new Error("completion receipt verification failed");
}

console.log(JSON.stringify({ ok: true, jobId: job.id, receipt }, null, 2));
