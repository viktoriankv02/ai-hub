import { expect } from "chai";
import { keccak256, toUtf8Bytes } from "ethers";
import { network } from "hardhat";
import { canonicalCompletionMessage, canonicalTaskHash } from "../agents/ai-jobs/completion-attestation.js";

const { ethers } = await network.connect();

function completionId(agentId: string, jobId: string, taskHash: string, resultHash: string, completedAt: string, signer: string): string {
  return keccak256(toUtf8Bytes([
    "AI_HUB_JOB_COMPLETION_V1", jobId, agentId, taskHash, resultHash, completedAt, signer.toLowerCase(),
  ].join("\n")));
}

describe("AICompletionReporter", function () {
  async function deploySystem() {
    const [owner, developer, other] = await ethers.getSigners();
    const ownerAddress = await owner.getAddress();
    const token = await ethers.deployContract("MockRewardToken");
    await token.waitForDeployment();
    const runtime = await ethers.deployContract("AIAgentRuntime", [ownerAddress]);
    await runtime.waitForDeployment();
    const engine = await ethers.deployContract("AIAgentEngine", [ownerAddress, await runtime.getAddress(), await token.getAddress()]);
    await engine.waitForDeployment();
    const registry = await ethers.deployContract("ActivityRegistry", [ownerAddress]);
    await registry.waitForDeployment();
    const reporter = await ethers.deployContract("AICompletionReporter", [ownerAddress, await engine.getAddress(), await registry.getAddress()]);
    await reporter.waitForDeployment();
    await (await registry.setActivityType(ethers.id("AI_JOB_COMPLETED"), true)).wait();
    await (await registry.setReporter(await reporter.getAddress(), true)).wait();
    await (await engine.setCompletionReporter(await reporter.getAddress(), true)).wait();
    await (await reporter.setCompletionCaller(ownerAddress, true)).wait();
    await (await reporter.setAttester(ownerAddress, true)).wait();
    return { owner, developer, other, token, runtime, engine, registry, reporter };
  }

  async function createAssignedJob(system: Awaited<ReturnType<typeof deploySystem>>) {
    const { owner, developer, token, runtime, engine } = system;
    const developerAddress = await developer.getAddress();
    await (await runtime.connect(developer).registerAgent("Worker", "endpoint", "metadata", "1.0.0")).wait();
    await (await runtime.connect(owner).setVerified(1, true)).wait();
    await (await runtime.connect(developer).startAgent(1)).wait();
    const reward = ethers.parseEther("10");
    await (await token.transfer(developerAddress, reward)).wait();
    await (await token.connect(developer).approve(await engine.getAddress(), reward)).wait();
    const rawTaskHash = "TASK_REPORTER";
    const taskHash = canonicalTaskHash(rawTaskHash);
    await (await engine.connect(developer).createJob(1, taskHash, reward)).wait();
    await (await engine.connect(owner).assignJob(1)).wait();
    return { rawTaskHash, taskHash };
  }

  async function signedCompletion(system: Awaited<ReturnType<typeof deploySystem>>, taskHash: string, resultHash = "RESULT_REPORTER") {
    const signer = await system.owner.getAddress();
    const payload = {
      version: "AI_HUB_JOB_COMPLETION_V1" as const,
      jobId: "1",
      agentId: "1",
      taskHash,
      resultHash,
      completedAt: "2026-08-13T17:00:00.000Z",
    };
    const signature = await system.owner.signMessage(canonicalCompletionMessage(payload));
    return {
      ...payload,
      signature,
      activityType: ethers.id("AI_JOB_COMPLETED"),
      projectId: ethers.id("AI_HUB_JOB_PIPELINE"),
      metadataHash: ethers.id("META_REPORTER"),
      completionId: completionId(payload.agentId, payload.jobId, payload.taskHash, payload.resultHash, payload.completedAt, signer),
    };
  }

  it("verifies a signed completion on-chain and records activity", async function () {
    const system = await deploySystem();
    const { taskHash } = await createAssignedJob(system);
    const { owner, developer, engine, registry, reporter } = system;
    const attestation = await signedCompletion(system, taskHash);
    const developerAddress = await developer.getAddress();
    const args = [1, attestation.agentId, attestation.taskHash, attestation.resultHash, attestation.completedAt, attestation.signature, attestation.activityType, attestation.projectId, attestation.metadataHash, attestation.completionId] as const;

    expect(await reporter.connect(owner).submitVerifiedCompletion.staticCall(...args)).to.equal(1n);
    await (await reporter.connect(owner).submitVerifiedCompletion(...args)).wait();

    const completed = await engine.jobs(1);
    expect(completed.completed).to.equal(true);
    expect(completed.resultHash).to.equal(keccak256(toUtf8Bytes("RESULT_REPORTER")));
    expect(await registry.totalActivities()).to.equal(1n);
    expect(await registry.activityCount(developerAddress)).to.equal(1n);
  });

  it("binds the signed agent id to the funded on-chain agent", async function () {
    const system = await deploySystem();
    const { taskHash } = await createAssignedJob(system);
    const { owner, reporter } = system;
    const attestation = await signedCompletion(system, taskHash, "RESULT_AGENT_BINDING");
    const forgedAgentId = "999";
    const forgedPayload = { ...attestation, agentId: forgedAgentId };
    const forgedSignature = await owner.signMessage(canonicalCompletionMessage(forgedPayload));
    const forgedCompletionId = completionId(forgedPayload.agentId, forgedPayload.jobId, forgedPayload.taskHash, forgedPayload.resultHash, forgedPayload.completedAt, await owner.getAddress());

    await expect(reporter.connect(owner).submitVerifiedCompletion(
      1, forgedPayload.agentId, forgedPayload.taskHash, forgedPayload.resultHash, forgedPayload.completedAt,
      forgedSignature, forgedPayload.activityType, forgedPayload.projectId, forgedPayload.metadataHash, forgedCompletionId,
    )).to.be.revertedWithCustomError(reporter, "InvalidAttestation");
  });

  it("requires an enabled completion caller", async function () {
    const system = await deploySystem();
    const { taskHash } = await createAssignedJob(system);
    const { other, reporter } = system;
    const attestation = await signedCompletion(system, taskHash, "RESULT_CALLER");
    await expect(reporter.connect(other).submitVerifiedCompletion(
      1, attestation.agentId, attestation.taskHash, attestation.resultHash, attestation.completedAt,
      attestation.signature, attestation.activityType, attestation.projectId, attestation.metadataHash, attestation.completionId,
    )).to.be.revertedWithCustomError(reporter, "UnauthorizedCaller");
  });

  it("requires an enabled attester", async function () {
    const system = await deploySystem();
    const { taskHash } = await createAssignedJob(system);
    const { owner, other, reporter } = system;
    const payload = {
      version: "AI_HUB_JOB_COMPLETION_V1" as const,
      jobId: "1", agentId: "1", taskHash, resultHash: "RESULT_UNTRUSTED", completedAt: "2026-08-13T17:00:00.000Z",
    };
    const signature = await other.signMessage(canonicalCompletionMessage(payload));
    const otherAddress = await other.getAddress();
    const completion = completionId(payload.agentId, payload.jobId, payload.taskHash, payload.resultHash, payload.completedAt, otherAddress);
    await expect(reporter.connect(owner).submitVerifiedCompletion(
      1, payload.agentId, payload.taskHash, payload.resultHash, payload.completedAt, signature,
      ethers.id("AI_JOB_COMPLETED"), ethers.id("AI_HUB_JOB_PIPELINE"), ethers.id("META_REPORTER"), completion,
    )).to.be.revertedWithCustomError(reporter, "UnauthorizedAttester");
  });

  it("rejects a modified signed payload", async function () {
    const system = await deploySystem();
    const { taskHash } = await createAssignedJob(system);
    const { owner, reporter } = system;
    const attestation = await signedCompletion(system, taskHash, "RESULT_ORIGINAL");
    await expect(reporter.connect(owner).submitVerifiedCompletion(
      1, attestation.agentId, attestation.taskHash, "RESULT_MODIFIED", attestation.completedAt,
      attestation.signature, attestation.activityType, attestation.projectId, attestation.metadataHash, attestation.completionId,
    )).to.be.revertedWithCustomError(reporter, "UnauthorizedAttester");
  });

  it("rejects replay of the same completion id", async function () {
    const system = await deploySystem();
    const { taskHash } = await createAssignedJob(system);
    const { owner, reporter } = system;
    const attestation = await signedCompletion(system, taskHash, "RESULT_REPLAY");
    const args = [1, attestation.agentId, attestation.taskHash, attestation.resultHash, attestation.completedAt, attestation.signature, attestation.activityType, attestation.projectId, attestation.metadataHash, attestation.completionId] as const;
    await (await reporter.connect(owner).submitVerifiedCompletion(...args)).wait();
    await expect(reporter.connect(owner).submitVerifiedCompletion(...args)).to.be.revertedWithCustomError(reporter, "CompletionAlreadySubmitted");
  });
});
