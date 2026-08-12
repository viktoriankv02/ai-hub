import { resolve } from "node:path";
import { AIJobHttpApi, AIJobOrchestrator, AIJobService, createAIJobExecutor, createEVMOnchainRuntime, JsonFileAIJobStore } from "../agents/ai-jobs/index.js";

const port = Number(process.env.AI_JOB_API_PORT ?? 8787);
const host = process.env.AI_JOB_API_HOST ?? "127.0.0.1";
const storePath = resolve(process.env.AI_JOB_STORE ?? "./data/ai-jobs.json");
const token = process.env.AI_JOB_API_TOKEN;
const batchSize = Number(process.env.AI_JOB_BATCH_SIZE ?? 5);
const maxAttempts = Number(process.env.AI_JOB_MAX_ATTEMPTS ?? 3);
const executorMode = process.env.AI_JOB_EXECUTOR ?? "dry-run";
const onchainEnabled = process.env.AI_JOB_ONCHAIN === "1" || process.env.AI_JOB_ONCHAIN === "true";

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("AI_JOB_API_PORT must be a valid TCP port");
if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("AI_JOB_BATCH_SIZE must be a positive integer");
if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error("AI_JOB_MAX_ATTEMPTS must be a positive integer");

const store = new JsonFileAIJobStore(storePath);
const orchestrator = new AIJobOrchestrator(store, { maxAttempts });
const executor = createAIJobExecutor();
const onchain = onchainEnabled ? createEVMOnchainRuntime({
  rpcUrl: process.env.AI_JOB_RPC_URL ?? process.env.BASE_SEPOLIA_RPC_URL ?? "",
  privateKey: process.env.AI_JOB_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY ?? "",
  assignmentPrivateKey: process.env.AI_JOB_ASSIGNMENT_PRIVATE_KEY,
  payoutPrivateKey: process.env.AI_JOB_PAYOUT_PRIVATE_KEY,
  engineAddress: process.env.AI_AGENT_ENGINE_ADDRESS ?? "",
  rewardTokenAddress: process.env.AI_REWARD_TOKEN_ADDRESS ?? "",
  completionReporterAddress: process.env.AI_COMPLETION_REPORTER_ADDRESS ?? "",
  bindingStorePath: process.env.AI_ONCHAIN_BINDINGS_STORE ?? "./data/onchain-job-bindings.json",
  autoAssign: process.env.AI_JOB_AUTO_ASSIGN !== "0",
  autoSettleReward: process.env.AI_JOB_AUTO_SETTLE_REWARD === "1" || process.env.AI_JOB_AUTO_SETTLE_REWARD === "true",
  activityType: process.env.AI_JOB_ACTIVITY_TYPE ?? "AI_JOB_COMPLETED",
  projectId: process.env.AI_JOB_PROJECT_ID,
  metadataHash: process.env.AI_JOB_METADATA_HASH,
  agentIdMap: process.env.AI_AGENT_ID_MAP_JSON ? JSON.parse(process.env.AI_AGENT_ID_MAP_JSON) : {},
}) : undefined;

const service = new AIJobService(orchestrator, executor, { batchSize, onchainCompletionCoordinator: onchain?.coordinator });
const api = new AIJobHttpApi(service, { token });
const server = api.createServer();

server.listen(port, host, async () => {
  console.log("AI Hub — AI job control plane");
  console.log(`HTTP: http://${host}:${port}`);
  console.log(`Store: ${storePath}`);
  console.log(`Executor: ${executorMode}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Max attempts: ${maxAttempts}`);
  console.log(`On-chain completion: ${onchainEnabled ? "enabled" : "disabled"}`);
  console.log(`Auto-settle reward: ${process.env.AI_JOB_AUTO_SETTLE_REWARD === "1" || process.env.AI_JOB_AUTO_SETTLE_REWARD === "true" ? "enabled" : "disabled"}`);
  if (executorMode === "openai-compatible") {
    console.log(`Provider base URL: ${process.env.AI_PROVIDER_BASE_URL ?? "https://api.openai.com/v1"}`);
    console.log(`Provider model: ${process.env.AI_PROVIDER_MODEL ?? "<missing>"}`);
  }
  if (onchain) {
    console.log(`On-chain funding signer: ${await onchain.signer.getAddress()}`);
    console.log(`On-chain assignment signer: ${await onchain.assignmentSigner.getAddress()}`);
    console.log(`On-chain payout signer: ${await onchain.payoutSigner.getAddress()}`);
    console.log(`On-chain engine: ${process.env.AI_AGENT_ENGINE_ADDRESS}`);
    console.log(`Completion reporter: ${process.env.AI_COMPLETION_REPORTER_ADDRESS}`);
  }
});

const shutdown = () => server.close(() => process.exit(0));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
