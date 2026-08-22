import { expect } from "chai";
import { Wallet } from "ethers";
import {
  assertValidCompletionAttestation,
  canonicalCompletionMessage,
  createCompletionAttestation,
  payloadFromJob,
  verifyCompletionAttestation,
} from "../agents/ai-jobs/completion-attestation.js";
import type { AIJobRecord } from "../agents/ai-jobs/types.js";

function completedJob(): AIJobRecord {
  return {
    idempotencyKey: "attestation:test:1",
    agentId: "drop-hunter",
    taskHash: "sha256:task-123",
    prompt: "Analyze the opportunity and return a concise execution plan.",
    reward: "25",
    trigger: "opportunity",
    opportunityId: "ink-builder",
    id: "job_attestation_1",
    status: "completed",
    attempts: 1,
    createdAt: "2026-08-12T10:00:00.000Z",
    startedAt: "2026-08-12T10:00:01.000Z",
    completedAt: "2026-08-12T10:00:05.000Z",
    updatedAt: "2026-08-12T10:00:05.000Z",
    resultHash: "sha256:result-456",
  };
}

describe("AI completion attestation", function () {
  it("creates and verifies a signed completion attestation", async function () {
    const signer = Wallet.createRandom();
    const attestation = await createCompletionAttestation(completedJob(), signer);

    expect(attestation.signer).to.equal(await signer.getAddress());
    expect(attestation.jobId).to.equal("job_attestation_1");
    expect(attestation.resultHash).to.equal("sha256:result-456");
    expect(attestation.signature).to.match(/^0x[0-9a-fA-F]{130}$/);
    expect(verifyCompletionAttestation(attestation)).to.equal(true);
    expect(() => assertValidCompletionAttestation(attestation)).not.to.throw();
  });

  it("rejects a signature from a different signer", async function () {
    const signer = Wallet.createRandom();
    const other = Wallet.createRandom();
    const attestation = await createCompletionAttestation(completedJob(), signer);

    const forged = { ...attestation, signer: await other.getAddress() };
    expect(verifyCompletionAttestation(forged)).to.equal(false);
    expect(() => assertValidCompletionAttestation(forged)).to.throw(
      "invalid completion attestation signature",
    );
  });

  it("rejects a tampered result hash", async function () {
    const signer = Wallet.createRandom();
    const attestation = await createCompletionAttestation(completedJob(), signer);

    const tampered = { ...attestation, resultHash: "sha256:tampered" };
    expect(verifyCompletionAttestation(tampered)).to.equal(false);
  });

  it("rejects attestations for incomplete jobs", function () {
    const job = completedJob();
    job.status = "running";
    expect(() => payloadFromJob(job)).to.throw("only completed jobs can be attested");
  });

  it("uses a deterministic canonical message", function () {
    const payload = payloadFromJob(completedJob());
    expect(canonicalCompletionMessage(payload)).to.equal(
      [
        "AI_HUB_JOB_COMPLETION_V1",
        "jobId=job_attestation_1",
        "agentId=drop-hunter",
        "taskHash=0xc8c63eb1f5f0c0c1ff0f340279ef08a2e73286382d634cc143e657b9da63a6c4",
        "resultHash=sha256:result-456",
        "completedAt=2026-08-12T10:00:05.000Z",
      ].join("\n"),
    );
  });
});
