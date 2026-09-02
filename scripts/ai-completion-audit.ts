import "dotenv/config";
import { resolve } from "node:path";
import { JsonFileAIJobStore } from "../agents/ai-jobs/json-store.js";
import { JsonCompletionPublicationStore } from "../agents/ai-jobs/completion-store.js";
import {
  assertValidCompletionAttestation,
  payloadFromJob,
} from "../agents/ai-jobs/completion-attestation.js";

const jobStorePath = resolve(process.env.AI_JOB_STORE ?? "./data/ai-jobs.json");
const completionStorePath = resolve(process.env.AI_JOB_COMPLETION_STORE ?? "./data/ai-job-completions.json");

const jobs = new JsonFileAIJobStore(jobStorePath).list();
const publications = new JsonCompletionPublicationStore(completionStorePath);

const report = {
  auditedAt: new Date().toISOString(),
  stores: { jobs: jobStorePath, completions: completionStorePath },
  totalJobs: jobs.length,
  completedJobs: 0,
  publishedJobs: 0,
  validAttestations: 0,
  errors: [] as Array<{ jobId: string; error: string }>,
};

for (const job of jobs) {
  if (job.status !== "completed") continue;
  report.completedJobs += 1;

  const publication = publications.get(job.id);
  if (!publication) {
    report.errors.push({ jobId: job.id, error: "completed job has no publication record" });
    continue;
  }

  report.publishedJobs += 1;
  const attestation = publication.attestation;
  if (!attestation) {
    report.errors.push({ jobId: job.id, error: "publication has no attestation" });
    continue;
  }

  try {
    assertValidCompletionAttestation(attestation);
    const expected = payloadFromJob(job);
    const fields = ["version", "jobId", "agentId", "taskHash", "resultHash", "completedAt"] as const;
    for (const field of fields) {
      if (expected[field] !== attestation[field]) {
        throw new Error(`attestation ${field} does not match persisted job`);
      }
    }
    report.validAttestations += 1;
  } catch (error) {
    report.errors.push({
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

console.log(JSON.stringify({
  ...report,
  healthy: report.errors.length === 0,
}, null, 2));

if (report.errors.length > 0) process.exitCode = 1;
