import { network } from "hardhat";
import { Wallet } from "ethers";
import { EVM_NETWORKS } from "./config/networks";
import { requireEnv, deployerPrivateKey } from "./config/env";
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
if (connectedChainId !== config.chainId) throw new Error(`Network mismatch: connected ${connectedChainId}, expected ${config.chainId}`);

async function hasBytecode(address: string): Promise<boolean> {
  return (await ethers.provider.getCode(address)) !== "0x";
}

const deployment = await loadDeployment(target);
validateDeploymentRecord(deployment, target, config.chainId);

const requiredContracts = ["AIHubRewardToken", "AIAgentRuntime", "AIAgentEngine", "AIJobReceiptRegistry", "AICompletionReporter", "ActivityRegistry"] as const;
for (const name of requiredContracts) {
  const address = assertAddress(name, deployment.contracts[name]);
  if (!(await hasBytecode(address))) throw new Error(`${name} has no deployed bytecode on Base Mainnet: ${address}`);
}

const [signer] = await ethers.getSigners();
const admin = await signer.getAddress();
const configuredAdmin = process.env.AI_HUB_ADMIN_ADDRESS?.trim();
if (configuredAdmin && ethers.isAddress(configuredAdmin) && ethers.getAddress(configuredAdmin).toLowerCase() !== admin.toLowerCase()) throw new Error(`AI_HUB_ADMIN_ADDRESS ${configuredAdmin} does not match deployer ${admin}`);

const tokenAddress = assertAddress("AIHubRewardToken", deployment.contracts.AIHubRewardToken);
const runtimeAddress = assertAddress("AIAgentRuntime", deployment.contracts.AIAgentRuntime);
const engineAddress = assertAddress("AIAgentEngine", deployment.contracts.AIAgentEngine);
const reporterAddress = assertAddress("AICompletionReporter", deployment.contracts.AICompletionReporter);
const receiptRegistryAddress = assertAddress("AIJobReceiptRegistry", deployment.contracts.AIJobReceiptRegistry);
const activityRegistryAddress = assertAddress("ActivityRegistry", deployment.contracts.ActivityRegistry);

const configuredEngineToken = assertAddress("AIAgentEngine.rewardToken", await (await ethers.getContractAt("AIAgentEngine", engineAddress)).rewardToken());
if (configuredEngineToken.toLowerCase() !== tokenAddress.toLowerCase()) {
  throw new Error(
    `Reward token mismatch: deployment AIHubRewardToken=${tokenAddress}, but AIAgentEngine.rewardToken=${configuredEngineToken}. ` +
      `Refusing to approve or fund a different token.`,
  );
}

const token = await ethers.getContractAt("AIHubRewardToken", configuredEngineToken);
const runtime = await ethers.getContractAt("AIAgentRuntime", runtimeAddress);
const engine = await ethers.getContractAt("AIAgentEngine", engineAddress);
const reporter = await ethers.getContractAt("AICompletionReporter", reporterAddress);
const receiptRegistry = await ethers.getContractAt("AIJobReceiptRegistry", receiptRegistryAddress);
const activityRegistry = await ethers.getContractAt("ActivityRegistry", activityRegistryAddress);

const reward = ethers.parseEther("1");
const tokenBalanceBefore = await token.balanceOf(admin);
if (tokenBalanceBefore < reward) throw new Error(`Smoke test requires at least 1 AIHUB in deployer/treasury balance; found ${ethers.formatEther(tokenBalanceBefore)}`);

const smokeActivityType = ethers.keccak256(ethers.toUtf8Bytes("AI_JOB_COMPLETED"));
const smokeProjectId = ethers.keccak256(ethers.toUtf8Bytes("AI_HUB_SMOKE"));
const smokeMetadataHash = ethers.keccak256(ethers.toUtf8Bytes(`smoke:${Date.now()}`));
const taskText = `AI_HUB_SMOKE_TASK_V1:${Date.now()}`;
const resultText = `AI_HUB_SMOKE_RESULT_V1:${Date.now()}`;
const taskHash = ethers.keccak256(ethers.toUtf8Bytes(taskText));

if (!(await activityRegistry.supportedActivityTypes(smokeActivityType))) {
  const tx = await activityRegistry.setActivityType(smokeActivityType, true);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`Activity type configuration failed: ${tx.hash}`);
}
if (!(await activityRegistry.reporters(reporterAddress))) {
  const tx = await activityRegistry.setReporter(reporterAddress, true);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`Activity reporter configuration failed: ${tx.hash}`);
}

let agentId: bigint | undefined;
let registrationTxHash: string | undefined;
const ownedAgentIds = await runtime.ownerAgents(admin);
for (let index = ownedAgentIds.length - 1; index >= 0; index -= 1) {
  const candidateId = ownedAgentIds[index];
  if (await runtime.canExecute(candidateId)) {
    agentId = candidateId;
    console.log(`Reusing existing runnable smoke agent ID: ${agentId.toString()}`);
    break;
  }
}

if (agentId === undefined) {
  const expectedAgentId = await runtime.nextAgentId();
  console.log(`Preparing new smoke agent ID: ${expectedAgentId.toString()}`);
  const registerTx = await runtime.registerAgent("AI Hub Smoke Agent", "local://ai-hub/smoke", "ipfs://ai-hub-smoke-agent", "1.0.0");
  const registerReceipt = await registerTx.wait();
  if (!registerReceipt || registerReceipt.status !== 1) throw new Error(`Agent registration failed: ${registerTx.hash}`);
  registrationTxHash = registerTx.hash;

  async function waitForAgent(agentIdToWaitFor: bigint, attempts = 8, delayMs = 1500): Promise<void> {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (await runtime.agentExists(agentIdToWaitFor)) return;
      if (attempt < attempts) {
        console.log(`Waiting for registered smoke agent ${agentIdToWaitFor.toString()} (attempt ${attempt}/${attempts})...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    const latestNextAgentId = await runtime.nextAgentId();
    throw new Error(
      `Smoke agent registration ${registerTx.hash} confirmed but agent ${agentIdToWaitFor.toString()} is not present. nextAgentId=${latestNextAgentId.toString()}. Preserve the transaction and inspect Base Mainnet state before retrying.`,
    );
  }

  await waitForAgent(expectedAgentId);
  agentId = expectedAgentId;

  const verifyTx = await runtime.setVerified(agentId, true);
  const verifyReceipt = await verifyTx.wait();
  if (!verifyReceipt || verifyReceipt.status !== 1) throw new Error(`Agent verification failed: ${verifyTx.hash}`);
  const startTx = await runtime.startAgent(agentId);
  const startReceipt = await startTx.wait();
  if (!startReceipt || startReceipt.status !== 1) throw new Error(`Agent start failed: ${startTx.hash}`);
}

const runnableAgentId = agentId;
const agent = await runtime.getAgent(runnableAgentId);
if (!agent.verified || agent.status !== 1n || agent.owner.toLowerCase() !== admin.toLowerCase()) throw new Error("Smoke agent is not verified/running or owner does not match deployer");

const allowanceBefore = await token.allowance(admin, engineAddress);
console.log(`AIHUB allowance before job funding: ${ethers.formatEther(allowanceBefore)} AIHUB`);
if (allowanceBefore < reward) {
  const approveTx = await token.approve(engineAddress, reward);
  const approveReceipt = await approveTx.wait();
  if (!approveReceipt || approveReceipt.status !== 1) throw new Error(`Reward token approval failed: ${approveTx.hash}`);
}

const allowanceAfter = await token.allowance(admin, engineAddress);
if (allowanceAfter < reward) {
  throw new Error(
    `Reward token allowance is still insufficient after approval: ${ethers.formatEther(allowanceAfter)} AIHUB; expected at least ${ethers.formatEther(reward)} AIHUB for engine ${engineAddress}.`,
  );
}

const jobId = await engine.nextJobId();
const createTx = await engine.createJob(runnableAgentId, taskHash, reward);
const createReceipt = await createTx.wait();
if (!createReceipt || createReceipt.status !== 1) throw new Error(`Job creation failed: ${createTx.hash}`);
const jobCreated = await engine.jobs(jobId);
if (jobCreated.creator.toLowerCase() !== admin.toLowerCase() || jobCreated.agentId !== runnableAgentId || jobCreated.taskHash !== taskHash || jobCreated.reward !== reward) throw new Error(`Created smoke job ${jobId} does not match expected state`);

const assignTx = await engine.assignJob(jobId);
const assignReceipt = await assignTx.wait();
if (!assignReceipt || assignReceipt.status !== 1) throw new Error(`Job assignment failed: ${assignTx.hash}`);

const completedAt = new Date().toISOString();
const signatureDigest = await reporter.completionDigest(jobId, `agent-${runnableAgentId.toString()}`, taskText, resultText, completedAt);
const signingWallet = new Wallet(deployerPrivateKey());
if (signingWallet.address.toLowerCase() !== admin.toLowerCase()) {
  throw new Error(`DEPLOYER_PRIVATE_KEY resolves to ${signingWallet.address}, but deployer signer is ${admin}`);
}
const signature = signingWallet.signingKey.sign(signatureDigest).serialized;
const attester = admin;
const completionId = await reporter.expectedCompletionId(jobId, `agent-${runnableAgentId.toString()}`, taskText, resultText, completedAt, attester);

const completionTx = await reporter.submitVerifiedCompletion(jobId, `agent-${runnableAgentId.toString()}`, taskText, resultText, completedAt, signature, smokeActivityType, smokeProjectId, smokeMetadataHash, completionId);
const completionReceipt = await completionTx.wait();
if (!completionReceipt || completionReceipt.status !== 1) throw new Error(`Verified completion failed: ${completionTx.hash}`);

const jobAfterCompletion = await engine.jobs(jobId);
if (!jobAfterCompletion.completed) throw new Error(`Smoke job ${jobId} is not marked completed`);
const hasReceipt = await receiptRegistry.hasReceipt(jobId);
if (!hasReceipt) throw new Error(`Smoke job ${jobId} has no durable receipt`);
const receipt = await receiptRegistry.getReceipt(jobId);
if (receipt.status !== 1n) throw new Error(`Smoke job ${jobId} receipt is not in Submitted status`);
if (receipt.attester.toLowerCase() !== attester.toLowerCase()) throw new Error(`Smoke receipt attester mismatch: ${receipt.attester}`);
if (receipt.taskHash !== taskHash) throw new Error("Smoke receipt task hash mismatch");
if (receipt.resultHash === ethers.ZeroHash) throw new Error("Smoke receipt result hash is empty");
if (receipt.resultHash !== ethers.keccak256(ethers.toUtf8Bytes(resultText))) throw new Error("Smoke receipt result hash does not match signed result text");

const balanceBeforePayout = await token.balanceOf(admin);
const payoutTx = await engine.payReward(jobId);
const payoutReceipt = await payoutTx.wait();
if (!payoutReceipt || payoutReceipt.status !== 1) throw new Error(`Reward payout failed: ${payoutTx.hash}`);
const balanceAfterPayout = await token.balanceOf(admin);
if (balanceAfterPayout - balanceBeforePayout !== reward) throw new Error(`Expected payout of ${reward}, observed ${balanceAfterPayout - balanceBeforePayout}`);
const finalJob = await engine.jobs(jobId);
if (finalJob.reward !== 0n) throw new Error(`Smoke job ${jobId} reward was not settled`);
const activityCount = await activityRegistry.activityCount(admin);
if (activityCount === 0n) throw new Error("Smoke completion did not create an activity record");

console.log("");
console.log("AI Hub Base Mainnet smoke test PASSED.");
console.log(`Agent ID:             ${runnableAgentId.toString()}`);
console.log(`Job ID:               ${jobId.toString()}`);
console.log(`Reward:               ${ethers.formatEther(reward)} AIHUB`);
if (registrationTxHash) console.log(`Registration tx:      ${registrationTxHash}`);
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
