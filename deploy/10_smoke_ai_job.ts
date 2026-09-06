import { network } from "hardhat";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv } from "./config/env";
import { validateDeploymentEnvironment } from "./config/validate";
import { assertAddress, loadDeployment, validateDeploymentRecord } from "./utils/deployment";

const target = requireEnv("AI_HUB_NETWORK");
validateDeploymentEnvironment(target);
if (target !== "base") {
  throw new Error(`AI Hub AI job smoke test is Base Mainnet-only; got ${target}`);
}

const config = EVM_NETWORKS[target];
const { ethers } = await network.connect();
const connectedChainId = Number((await ethers.provider.getNetwork()).chainId);
if (connectedChainId !== config.chainId) {
  throw new Error(`Network mismatch: connected ${connectedChainId}, expected ${config.chainId}`);
}

const deployment = await loadDeployment(target);
validateDeploymentRecord(deployment, target, config.chainId);

const requiredContracts = [
  "AIHubRewardToken",
  "AIAgentRuntime",
  "AIAgentEngine",
  "AIJobReceiptRegistry",
  "AICompletionReporter",
  "ActivityRegistry",
] as const;

for (const name of requiredContracts) {
  const address = assertAddress(name, deployment.contracts[name]);
  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`${name} has no deployed bytecode: ${address}`);
}

const [signer] = await ethers.getSigners();
const admin = await signer.getAddress();
const configuredAdmin = process.env.AI_HUB_ADMIN_ADDRESS?.trim();
if (configuredAdmin && ethers.isAddress(configuredAdmin) && ethers.getAddress(configuredAdmin).toLowerCase() !== admin.toLowerCase()) {
  throw new Error(`AI_HUB_ADMIN_ADDRESS ${configuredAdmin} does not match deployer ${admin}`);
}

const tokenAddress = assertAddress("AIHubRewardToken", deployment.contracts.AIHubRewardToken);
const runtimeAddress = assertAddress("AIAgentRuntime", deployment.contracts.AIAgentRuntime);
const engineAddress = assertAddress("AIAgentEngine", deployment.contracts.AIAgentEngine);
const reporterAddress = assertAddress("AICompletionReporter", deployment.contracts.AICompletionReporter);
const receiptRegistryAddress = assertAddress("AIJobReceiptRegistry", deployment.contracts.AIJobReceiptRegistry);
const activityRegistryAddress = assertAddress("ActivityRegistry", deployment.contracts.ActivityRegistry);

const token = await ethers.getContractAt("AIHubRewardToken", tokenAddress);
const runtime = await ethers.getContractAt("AIAgentRuntime", runtimeAddress);
const engine = await ethers.getContractAt("AIAgentEngine", engineAddress);
const reporter = await ethers.getContractAt("AICompletionReporter", reporterAddress);
const receiptRegistry = await ethers.getContractAt("AIJobReceiptRegistry", receiptRegistryAddress);
const activityRegistry = await ethers.getContractAt("ActivityRegistry", activityRegistryAddress);

const reward = ethers.parseEther("1");
const tokenBalanceBefore = await token.balanceOf(admin);
if (tokenBalanceBefore < reward) {
  throw new Error(`Smoke test requires at least 1 AIHUB in deployer/treasury balance; found ${ethers.formatEther(tokenBalanceBefore)}`);
}

const smokeActivityType = ethers.keccak256(ethers.toUtf8Bytes("AI_JOB_COMPLETED"));
const smokeProjectId = ethers.keccak256(ethers.toUtf8Bytes("AI_HUB_SMOKE"));
const smokeMetadataHash = ethers.keccak256(ethers.toUtf8Bytes(`smoke:${Date.now()}`));
const taskText = `AI_HUB_SMOKE_TASK_V1:${Date.now()}`;
const resultText = `AI_HUB_SMOKE_RESULT_V1:${Date.now()}`;
const taskHash = ethers.keccak256(ethers.toUtf8Bytes(taskText));
const agentName = "AI Hub Smoke Agent";
const agentIdText = `agent-${(await runtime.nextAgentId()).toString()}`;

if (!(await activityRegistry.supportedActivityTypes(smokeActivityType))) {
  const activityTx = await activityRegistry.setActivityType(smokeActivityType, true);
  const activityReceipt = await activityTx.wait();
  if (!activityReceipt || activityReceipt.status !== 1) throw new Error(`Activity type configuration failed: ${activityTx.hash}`);
}

if (!(await activityRegistry.reporters(reporterAddress))) {
  const reporterTx = await activityRegistry.setReporter(reporterAddress, true);
  const reporterReceipt = await reporterTx.wait();
  if (!reporterReceipt || reporterReceipt.status !== 1) throw new Error(`Activity reporter configuration failed: ${reporterTx.hash}`);
}

const agentId = await runtime.nextAgentId();
const registerTx = await runtime.registerAgent(
  agentName,
  "local://ai-hub/smoke",
  "ipfs://ai-hub-smoke-agent",
  "1.0.0",
);
const registerReceipt = await registerTx.wait();
if (!registerReceipt || registerReceipt.status !== 1) throw new Error(`Agent registration failed: ${registerTx.hash}`);

if (agentId.toString() !== agentIdText.slice("agent-".length)) {
  throw new Error(`Agent ID race detected: expected ${agentIdText}, actual ${agentId.toString()}`);
}

const verifyTx = await runtime.setVerified(agentId, true);
const verifyReceipt = await verifyTx.wait();
if (!verifyReceipt || verifyReceipt.status !== 1) throw new Error(`Agent verification failed: ${verifyTx.hash}`);

const startTx = await runtime.startAgent(agentId);
const startReceipt = await startTx.wait();
if (!startReceipt || startReceipt.status !== 1) throw new Error(`Agent start failed: ${startTx.hash}`);

const agent = await runtime.getAgent(agentId);
if (!agent.verified || agent.status !== 1 || agent.owner.toLowerCase() !== admin.toLowerCase()) {
  throw new Error(`Smoke agent is not verified/running or owner does not match deployer`);
}

const approveTx = await token.approve(engineAddress, reward);
const approveReceipt = await approveTx.wait();
if (!approveReceipt || approveReceipt.status !== 1) throw new Error(`Reward token approval failed: ${approveTx.hash}`);

const jobId = await engine.nextJobId();
const createTx = await engine.createJob(agentId, taskHash, reward);
const createReceipt = await createTx.wait();
if (!createReceipt || createReceipt.status !== 1) throw new Error(`Job creation failed: ${createTx.hash}`);

const jobCreated = await engine.jobs(jobId);
if (jobCreated.creator.toLowerCase() !== admin.toLowerCase() || jobCreated.agentId !== agentId || jobCreated.taskHash !== taskHash || jobCreated.reward !== reward) {
  throw new Error(`Created smoke job ${jobId} does not match expected creator, agent, task hash, or reward`);
}

const assignTx = await engine.assignJob(jobId);
const assignReceipt = await assignTx.wait();
if (!assignReceipt || assignReceipt.status !== 1) throw new Error(`Job assignment failed: ${assignTx.hash}`);

const completedAt = new Date().toISOString();
const completionPayload =
  "AI_HUB_JOB_COMPLETION_V1\n" +
  `jobId=${jobId.toString()}\n` +
  `agentId=${agentIdText}\n` +
  `taskHash=${taskText}\n` +
  `resultHash=${resultText}\n` +
  `completedAt=${completedAt}`;
const payloadHash = ethers.keccak256(ethers.toUtf8Bytes(completionPayload));
const signature = await signer.signMessage(ethers.getBytes(payloadHash));

const attester = admin;
const completionId = await reporter.expectedCompletionId(
  jobId,
  agentIdText,
  taskText,
  resultText,
  completedAt,
  attester,
);

const completionTx = await reporter.submitVerifiedCompletion(
  jobId,
  agentIdText,
  taskText,
  resultText,
  completedAt,
  signature,
  smokeActivityType,
  smokeProjectId,
  smokeMetadataHash,
  completionId,
);
const completionReceipt = await completionTx.wait();
if (!completionReceipt || completionReceipt.status !== 1) throw new Error(`Verified completion failed: ${completionTx.hash}`);

const jobAfterCompletion = await engine.jobs(jobId);
if (!jobAfterCompletion.completed) throw new Error(`Smoke job ${jobId} is not marked completed`);

const hasReceipt = await receiptRegistry.hasReceipt(jobId);
if (!hasReceipt) throw new Error(`Smoke job ${jobId} has no durable receipt`);

const receipt = await receiptRegistry.getReceipt(jobId);
if (receipt.status !== 1) throw new Error(`Smoke job ${jobId} receipt is not in Submitted status`);
if (receipt.attester.toLowerCase() !== attester.toLowerCase()) throw new Error(`Smoke receipt attester mismatch: ${receipt.attester}`);
if (receipt.taskHash !== taskHash) throw new Error(`Smoke receipt task hash mismatch`);
if (receipt.resultHash === ethers.ZeroHash) throw new Error(`Smoke receipt result hash is empty`);
if (receipt.resultHash !== ethers.keccak256(ethers.toUtf8Bytes(resultText))) throw new Error(`Smoke receipt result hash does not match signed result text`);

const balanceBeforePayout = await token.balanceOf(admin);
const payoutTx = await engine.payReward(jobId);
const payoutReceipt = await payoutTx.wait();
if (!payoutReceipt || payoutReceipt.status !== 1) throw new Error(`Reward payout failed: ${payoutTx.hash}`);
const balanceAfterPayout = await token.balanceOf(admin);
if (balanceAfterPayout - balanceBeforePayout !== reward) {
  throw new Error(`Expected payout of ${reward}, observed ${balanceAfterPayout - balanceBeforePayout}`);
}

const finalJob = await engine.jobs(jobId);
if (finalJob.reward !== 0n) throw new Error(`Smoke job ${jobId} reward was not settled`);
const activityCount = await activityRegistry.activityCount(admin);
if (activityCount === 0n) throw new Error(`Smoke completion did not create an activity record`);

console.log("");
console.log(`AI Hub Base Mainnet smoke test PASSED.`);
console.log(`Agent ID:             ${agentId.toString()}`);
console.log(`Job ID:               ${jobId.toString()}`);
console.log(`Reward:               ${ethers.formatEther(reward)} AIHUB`);
console.log(`Completion tx:        ${completionTx.hash}`);
console.log(`Receipt recorded:     ${hasReceipt}`);
console.log(`Payout tx:            ${payoutTx.hash}`);
console.log(`Activity count:       ${activityCount.toString()}`);
console.log(`Agent owner:          ${admin}`);
console.log(`AIHubRewardToken:     ${tokenAddress}`);
console.log(`AIAgentRuntime:       ${runtimeAddress}`);
console.log(`AIAgentEngine:        ${engineAddress}`);
console.log(`AICompletionReporter: ${reporterAddress}`);
console.log(`AIJobReceiptRegistry: ${receiptRegistryAddress}`);
