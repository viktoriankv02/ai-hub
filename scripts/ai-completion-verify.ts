import "dotenv/config";
import { resolve } from "node:path";
import { JsonFileAIJobStore } from "../agents/ai-jobs/json-store.js";
import { JsonCompletionPublicationStore } from "../agents/ai-jobs/completion-store.js";
import {
  assertValidCompletionAttestation,
  payloadFromJob,
  verifyCompletionAttestation,
} from "../agents/ai-jobs/completion-attestation.js";

const jobId = process.argv[2]?.trim();
const jobStorePath = resolve(process.env.AI_JOB_STORE ?? "./data/ai-jobs.json");
const completionStorePath = resolve(process.env.AI_JOB_COMPLETION_STORE ?? "./data/ai-job-completions.json");

if (!jobId) {
  throw new Error("usage: npm run ai-completion:verify -- <jobId>");
}

const job = new JsonFileAIJobStore(jobStorePath).get(jobId);
if (!job) throw new Error(`AI job not found: ${jobId}`);

const publication = new JsonCompletionPublicationStore(completionStorePath).get(jobId);
if (!publication) throw new Error(`completion publication not found: ${jobId}`);
if (!publication.attestation) throw new Error(`completion publication has no attestation: ${jobId}`);

assertValidCompletionAttestation(publication.attestation);

const expected = payloadFromJob(job);
const actual = publication.attestation;
const fieldsMatch = (
  expected.version === actual.version &&
  expected.jobId === actual.jobId &&
  expected.agentId === actual.agentId &&
  expected.taskHash === actual.taskHash &&
  expected.resultHash === actual.resultHash &&
  expected.completedAt === actual.completedAt
);

if (!fieldsMatch) {
  throw new Error(`completion attestation does not match persisted job: ${jobId}`);
}

if (!verifyCompletionAttestation(actual)) {
  throw new Error(`completion attestation signature is invalid: ${jobId}`);
}

console.log(JSON.stringify({
  verified: true,
  jobId,
  jobStatus: job.status,
  signer: actual.signer,
  transactionId: publication.transactionId,
  resultHash: actual.resultHash,
  completedAt: actual.completedAt,
  store: completionStorePath,
}, null, 2));
