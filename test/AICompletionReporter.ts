import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

const CHAIN_ID = 31337n;
const ACTIVITY_TYPE = ethers.id("AI_JOB_COMPLETED");
const PROJECT_ID = ethers.id("AI_HUB_JOB_PIPELINE");

async function deploySystem() {
  const [owner, developer, reporter, attacker] = await ethers.getSigners();
  const ownerAddress = await owner.getAddress();

  const token = await ethers.deployContract("MockRewardToken");
  await token.waitForDeployment();

  const runtime = await ethers.deployContract("AIAgentRuntime", [ownerAddress]);
  await runtime.waitForDeployment();

  const engine = await ethers.deployContract("AIAgentEngine", [
    ownerAddress,
    await runtime.getAddress(),
    await token.getAddress(),
  ]);
  await engine.waitForDeployment();

  const registry = await ethers.deployContract("ActivityRegistry", [ownerAddress]);
  await registry.waitForDeployment();

  const completionReporter = await ethers.deployContract("AICompletionReporter", [
    ownerAddress,
    await engine.getAddress(),
    await registry.getAddress(),
  ]);
  await completionReporter.waitForDeployment();

  await (await registry.setActivityType(ACTIVITY_TYPE, true)).wait();
  await (await registry.setReporter(await completionReporter.getAddress(), true)).wait();
  await (await engine.setCompletionReporter(await completionReporter.getAddress(), true)).wait();

  await (
    await runtime.connect(developer).registerAgent(
      "Completion Worker",
      "https://agent.example/execute",
      "ipfs://agent-metadata",
      "1.0.0",
    )
  ).wait();
  await (await runtime.connect(owner).setVerified(1, true)).wait();
  await (await runtime.connect(developer).startAgent(1)).wait();

  const reward = ethers.parseEther("10");
  await (await token.transfer(await developer.getAddress(), reward)).wait();
  await (await token.connect(developer).approve(await engine.getAddress(), reward)).wait();
  await (await engine.connect(developer).createJob(1, ethers.id("TASK_REPORTER_001"), reward)).wait();
  await (await engine.connect(owner).assignJob(1)).wait();

  return { owner, developer, reporter, attacker, token, runtime, engine, registry, completionReporter };
}

describe("AICompletionReporter", function () {
  it("atomically completes the job and records verified activity", async function () {
    const { developer, engine, registry, completionReporter } = await deploySystem();
    const developerAddress = await developer.getAddress();
    const resultHash = ethers.id("RESULT_001");
    const metadataHash = ethers.id("META_001");
    const completionId = ethers.id("COMPLETION_001");

    await (
      await completionReporter.submitVerifiedCompletion(
        1,
        resultHash,
        ACTIVITY_TYPE,
        PROJECT_ID,
        metadataHash,
        completionId,
      )
    ).wait();

    const job = await engine.jobs(1);
    expect(job.completed).to.equal(true);
    expect(job.resultHash).to.equal(resultHash);

    expect(await completionReporter.submittedCompletions(completionId)).to.equal(true);
    expect(await registry.totalActivities()).to.equal(1n);

    const activity = await registry.getActivity(developerAddress, 0);
    expect(activity.chainId).to.equal(CHAIN_ID);
    expect(activity.activityType).to.equal(ACTIVITY_TYPE);
    expect(activity.projectId).to.equal(PROJECT_ID);
    expect(activity.metadataHash).to.equal(metadataHash);
    expect(activity.verified).to.equal(true);
  });

  it("rejects an unauthorized completion caller", async function () {
    const { attacker, completionReporter } = await deploySystem();

    await expect(
      completionReporter.connect(attacker).submitVerifiedCompletion(
        1,
        ethers.id("RESULT_ATTACK"),
        ACTIVITY_TYPE,
        PROJECT_ID,
        ethers.id("META_ATTACK"),
        ethers.id("COMPLETION_ATTACK"),
      ),
    ).to.be.revertedWithCustomError(completionReporter, "OwnableUnauthorizedAccount");
  });

  it("rejects the same completion id twice", async function () {
    const { completionReporter } = await deploySystem();
    const completionId = ethers.id("COMPLETION_DUP");

    await (
      await completionReporter.submitVerifiedCompletion(
        1,
        ethers.id("RESULT_DUP"),
        ACTIVITY_TYPE,
        PROJECT_ID,
        ethers.id("META_DUP"),
        completionId,
      )
    ).wait();

    await expect(
      completionReporter.submitVerifiedCompletion(
        1,
        ethers.id("RESULT_DUP_2"),
        ACTIVITY_TYPE,
        PROJECT_ID,
        ethers.id("META_DUP_2"),
        completionId,
      ),
    ).to.be.revertedWithCustomError(completionReporter, "CompletionAlreadySubmitted");
  });

  it("rejects completion when the job was not assigned", async function () {
    const { owner, developer, token, engine, completionReporter, runtime } = await deploySystem();
    const reward = ethers.parseEther("1");

    await (await engine.connect(owner).cancelJob(1)).wait();

    await (await token.transfer(await developer.getAddress(), reward)).wait();
    await (await token.connect(developer).approve(await engine.getAddress(), reward)).wait();
    await (await engine.connect(developer).createJob(1, ethers.id("TASK_UNASSIGNED"), reward)).wait();

    await expect(
      completionReporter.submitVerifiedCompletion(
        2,
        ethers.id("RESULT_UNASSIGNED"),
        ACTIVITY_TYPE,
        PROJECT_ID,
        ethers.id("META_UNASSIGNED"),
        ethers.id("COMPLETION_UNASSIGNED"),
      ),
    ).to.be.revertedWithCustomError(completionReporter, "InvalidJob");

    expect(await runtime.canExecute(1)).to.equal(true);
  });

  it("rejects an empty result hash before consuming the completion id", async function () {
    const { completionReporter } = await deploySystem();
    const completionId = ethers.id("COMPLETION_EMPTY_RESULT");

    await expect(
      completionReporter.submitVerifiedCompletion(
        1,
        ethers.ZeroHash,
        ACTIVITY_TYPE,
        PROJECT_ID,
        ethers.id("META_EMPTY_RESULT"),
        completionId,
      ),
    ).to.be.revertedWithCustomError(completionReporter, "EmptyResultHash");

    expect(await completionReporter.submittedCompletions(completionId)).to.equal(false);
  });
});
