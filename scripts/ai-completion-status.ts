import "dotenv/config";
import { resolve } from "node:path";
import { JsonFileAIJobStore } from "../agents/ai-jobs/json-store.js";
import { JsonCompletionPublicationStore } from "../agents/ai-jobs/completion-store.js";
import { assertValidCompletionAttestation } from "../agents/ai-jobs/completion-attestation.js";

const jobId = process.argv[2]?.trim();
const jobStorePath = resolve(process.env.AI_JOB_STORE ?? "./data/ai-jobs.json");
const completionStorePath = resolve(process.env.AI_JOB_COMPLETION_STORE ?? "./data/ai-job-completions.json");

if (!jobId) {
  throw new Error("usage: npm run ai-completion:status -- <jobId>");
}

const job = new JsonFileAIJobStore(jobStorePath).get(jobId);
if (!job) throw new Error(`AI job not found: ${jobId}`);

const publication = new JsonCompletionPublicationStore(completionStorePath).get(jobId);
const attestation = publication?.attestation;

if (attestation) {
  assertValidCompletionAttestation(attestation);
}

console.log(JSON.stringify({
  job: {
    id: job.id,
    status: job.status,
    agentId: job.agentId,
    taskHash: job.taskHash,
    resultHash: job.resultHash ?? null,
    completedAt: job.completedAt ?? null,
    attempts: job.attempts,
  },
  completion: publication
    ? {
        transactionId: publication.transactionId,
        publishedAt: publication.publishedAt,
        attested: Boolean(attestation),
        signer: attestation?.signer ?? null,
        completionTaskHash: attestation?.taskHash ?? null,
      }
    : null,
  stores: {
    jobs: jobStorePath,
    completions: completionStorePath,
  },
}, null, 2));
