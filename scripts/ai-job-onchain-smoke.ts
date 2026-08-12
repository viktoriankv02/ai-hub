import "dotenv/config";
import { AIJobOrchestrator, DryRunAIExecutor, AIJobService, createEVMOnchainRuntime } from "../agents/ai-jobs/index.js";

const rpcUrl = process.env.AI_JOB_RPC_URL ?? process.env.BASE_SEPOLIA_RPC_URL ?? "";
const privateKey = process.env.AI_JOB_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY ?? "";
const engineAddress = process.env.AI_AGENT_ENGINE_ADDRESS ?? "";
const rewardTokenAddress = process.env.AI_REWARD_TOKEN_ADDRESS ?? "";
const reporterAddress = process.env.AI_COMPLETION_REPORTER_ADDRESS ?? "";
const agentId = process.env.AI_JOB_SMOKE_AGENT_ID ?? "1";
const reward = process.env.AI_JOB_SMOKE_REWARD ?? "1";

if (!rpcUrl || !privateKey || !engineAddress || !rewardTokenAddress || !reporterAddress) {
  throw new Error("AI_JOB_RPC_URL, AI_JOB_PRIVATE_KEY, AI_AGENT_ENGINE_ADDRESS, AI_REWARD_TOKEN_ADDRESS and AI_COMPLETION_REPORTER_ADDRESS are required");
}

const onchain = createEVMOnchainRuntime({
  rpcUrl,
  privateKey,
  engineAddress,
  rewardTokenAddress,
  completionReporterAddress: reporterAddress,
  bindingStorePath: process.env.AI_ONCHAIN_BINDINGS_STORE ?? "./data/onchain-job-bindings.json",
  autoAssign: true,
  activityType: process.env.AI_JOB_ACTIVITY_TYPE ?? "AI_JOB_COMPLETED",
  projectId: process.env.AI_JOB_PROJECT_ID ?? "AI_HUB_JOB_PIPELINE",
  metadataHash: process.env.AI_JOB_METADATA_HASH,
  agentIdMap: { [agentId]: agentId },
});

const orchestrator = new AIJobOrchestrator();
const service = new AIJobService(orchestrator, new DryRunAIExecutor(), {
  onchainCompletionCoordinator: onchain.coordinator,
});

const job = service.enqueue({
  idempotencyKey: `onchain-smoke:${Date.now()}`,
  agentId,
  taskHash: `smoke-task:${Date.now()}`,
  prompt: "Perform a deterministic AI Hub on-chain runtime smoke test.",
  reward,
  trigger: "manual",
});

console.log(`offchainJob=${job.id}`);
console.log(`signer=${await onchain.signer.getAddress()}`);

const result = await service.runAndSubmitOnchain(job.id);
console.log(JSON.stringify({
  jobId: result.jobId,
  onchainJobId: result.provisioning.onchainJobId.toString(),
  provisionTx: result.provisioning.transactionId,
  completionTx: result.completion.transactionId,
  completionId: result.completion.attestation.jobId,
}, null, 2));
