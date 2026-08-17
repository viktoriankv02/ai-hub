import { expect } from "chai";
import { Wallet } from "ethers";
import {
  COMPLETION_ATTESTATION_VERSION,
  canonicalCompletionMessage,
  type CompletionAttestation,
} from "../agents/ai-jobs/completion-attestation.js";
import { CompletionAttestationPolicy } from "../agents/ai-jobs/completion-policy.js";
import type { AIJobRecord } from "../agents/ai-jobs/types.js";

function completedJob(overrides: Partial<AIJobRecord> = {}): AIJobRecord {
  return {
    idempotencyKey: "policy:test:1",
    agentId: "1",
    taskHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    prompt: "execute",
    reward: "1",
    trigger: "manual",
    id: "job_policy_1",
    status: "completed",
    attempts: 1,
    createdAt: "2026-08-17T10:00:00.000Z",
    startedAt: "2026-08-17T10:00:01.000Z",
    completedAt: "2026-08-17T10:00:05.000Z",
    updatedAt: "2026-08-17T10:00:05.000Z",
    resultHash: "RESULT_POLICY",
    ...overrides,
  };
}

async function attestation(job: AIJobRecord, wallet: Wallet): Promise<CompletionAttestation> {
  const payload = {
    version: COMPLETION_ATTESTATION_VERSION,
    jobId: job.id,
    agentId: job.agentId,
    taskHash: job.taskHash,
    resultHash: job.resultHash!,
    completedAt: job.completedAt!,
  } as const;
  return {
    ...payload,
    signer: await wallet.getAddress(),
    signature: await wallet.signMessage(canonicalCompletionMessage(payload)),
  };
}

describe("AICompletionPolicy", function () {
  it("accepts a fresh completion matching the persisted job", async function () {
    const wallet = Wallet.createRandom();
    const job = completedJob();
    const signed = await attestation(job, wallet);
    const policy = new CompletionAttestationPolicy({
      maxAgeMs: 60_000,
      now: () => new Date("2026-08-17T10:00:30.000Z"),
      allowedSigners: [await wallet.getAddress()],
    });

    const result = policy.validate(job, signed);
    expect(result.valid).to.equal(true);
    expect(result.ageMs).to.equal(25_000);
  });

  it("rejects stale completions before publication", async function () {
    const wallet = Wallet.createRandom();
    const job = completedJob();
    const signed = await attestation(job, wallet);
    const policy = new CompletionAttestationPolicy({
      maxAgeMs: 10_000,
      now: () => new Date("2026-08-17T10:01:00.000Z"),
    });

    expect(() => policy.validate(job, signed)).to.throw("completion attestation has expired");
  });

  it("rejects a signer outside the local allow-list", async function () {
    const signer = Wallet.createRandom();
    const allowed = Wallet.createRandom();
    const job = completedJob();
    const signed = await attestation(job, signer);
    const policy = new CompletionAttestationPolicy({
      now: () => new Date("2026-08-17T10:00:30.000Z"),
      allowedSigners: [await allowed.getAddress()],
    });

    expect(() => policy.validate(job, signed)).to.throw("completion attestation signer is not allowed");
  });

  it("rejects a job/result mismatch even with a valid signature", async function () {
    const wallet = Wallet.createRandom();
    const job = completedJob({ resultHash: "RESULT_A" });
    const signed = await attestation(job, wallet);
    const modifiedJob = completedJob({ resultHash: "RESULT_B" });
    const policy = new CompletionAttestationPolicy({
      now: () => new Date("2026-08-17T10:00:30.000Z"),
    });

    expect(() => policy.validate(modifiedJob, signed)).to.throw("resultHash does not match");
  });
});
