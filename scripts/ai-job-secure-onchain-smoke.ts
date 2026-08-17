import "dotenv/config";
import {
  AIJobOrchestrator,
  AIJobService,
  DryRunAIExecutor,
} from "../agents/ai-jobs/index.js";
import { createSecureEVMOnchainRuntime } from "../agents/ai-jobs/secure-onchain-runtime.js";

const rpcUrl = process.env.AI_JOB_RPC_URL ?? process.env.BASE_SEPOLIA_RPC_URL ?? "";
const privateKey = process.env.AI_JOB_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY ?? "";
const engineAddress = process.env.AI_AGENT_ENGINE_ADDRESS ?? "";
const rewardTokenAddress = process.env.AI_REWARD_TOKEN_ADDRESS ?? "";
const reporterAddress = process.env.AI_COMPLETION_REPORTER_ADDRESS ?? "";
const agentId = process.env.AI_JOB_SMOKE_AGENT_ID ?? "1";
const reward = process.env.AI_JOB_SMOKE_REWARD ?? "1";

if (!rpcUrl || !privateKey || !engineAddress || !rewardTokenAddress || !reporterAddress) {
  throw new Error(
    "AI_JOB_RPC_URL, AI_JOB_PRIVATE_KEY, AI_AGENT_ENGINE_ADDRESS, AI_REWARD_TOKEN_ADDRESS and AI_COMPLETION_REPORTER_ADDRESS are required",
  );
}

const runtime = createSecureEVMOnchainRuntime({
  rpcUrl,
  privateKey,
  assignmentPrivateKey: process.env.AI_JOB_ASSIGNMENT_PRIVATE_KEY,
  payoutPrivateKey: process.env.AI_JOB_PAYOUT_PRIVATE_KEY,
  engineAddress,
  rewardTokenAddress,
  completionReporterAddress: reporterAddress,
  bindingStorePath: process.env.AI_ONCHAIN_BINDINGS_STORE ?? "./data/onchain-job-bindings.json",
  completionStorePath: process.env.AI_JOB_COMPLETION_STORE ?? "./data/ai-job-completions.json",
  autoAssign: true,
  autoSettleReward: process.env.AI_JOB_AUTO_SETTLE_REWARD === "true",
  activityType: process.env.AI_JOB_ACTIVITY_TYPE ?? "AI_JOB_COMPLETED",
  projectId: process.env.AI_JOB_PROJECT_ID ?? "AI_HUB_JOB_PIPELINE",
  metadataHash: process.env.AI_JOB_METADATA_HASH,
  agentIdMap: { [agentId]: agentId },
  completionPolicy: {
    maxAgeMs: Number(process.env.AI_COMPLETION_MAX_AGE_MS ?? 86_400_000),
    clockSkewMs: Number(process.env.AI_COMPLETION_CLOCK_SKEW_MS ?? 30_000),
    allowedSigners: process.env.AI_COMPLETION_ATTESTER_ADDRESS
      ? [process.env.AI_COMPLETION_ATTESTER_ADDRESS]
      : undefined,
  },
});

const orchestrator = new AIJobOrchestrator();
const service = new AIJobService(orchestrator, new DryRunAIExecutor(), {
  onchainCompletionCoordinator: runtime.coordinator,
});

const job = service.enqueue({
  idempotencyKey: `secure-onchain-smoke:${Date.now()}`,
  agentId,
  taskHash: `secure-smoke-task:${Date.now()}`,
  prompt: "Perform a deterministic policy-gated AI Hub on-chain runtime smoke test.",
  reward,
  trigger: "manual",
});

console.log(`offchainJob=${job.id}`);
console.log(`signer=${await runtime.signer.getAddress()}`);

const result = await service.runAndSubmitOnchain(job.id);
console.log(JSON.stringify({
  jobId: result.jobId,
  onchainJobId: result.provisioning.onchainJobId.toString(),
  provisionTx: result.provisioning.transactionId,
  completionTx: result.completion.transactionId,
  reused: result.completion.reused,
  attester: result.completion.attestation.signer,
  taskHash: result.completion.attestation.taskHash,
  resultHash: result.completion.attestation.resultHash,
}, null, 2));
