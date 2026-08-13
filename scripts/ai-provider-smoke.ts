import { AIProviderJobExecutor, OpenAICompatibleProvider } from "../agents/ai-jobs/index.js";
import type { AIJobRecord } from "../agents/ai-jobs/index.js";

const apiKey = process.env.AI_PROVIDER_API_KEY?.trim();
const model = process.env.AI_PROVIDER_MODEL?.trim();

if (!apiKey) throw new Error("AI_PROVIDER_API_KEY is required");
if (!model) throw new Error("AI_PROVIDER_MODEL is required");

const provider = new OpenAICompatibleProvider({
  apiKey,
  model,
  baseUrl: process.env.AI_PROVIDER_BASE_URL,
  systemPrompt: process.env.AI_PROVIDER_SYSTEM_PROMPT ?? "You are an AI Hub execution agent. Follow the task exactly and do not invent facts.",
  temperature: process.env.AI_PROVIDER_TEMPERATURE ? Number(process.env.AI_PROVIDER_TEMPERATURE) : 0,
  maxTokens: process.env.AI_PROVIDER_MAX_TOKENS ? Number(process.env.AI_PROVIDER_MAX_TOKENS) : 256,
  timeoutMs: process.env.AI_PROVIDER_TIMEOUT_MS ? Number(process.env.AI_PROVIDER_TIMEOUT_MS) : 120_000,
});

const executor = new AIProviderJobExecutor(provider);
const job: AIJobRecord = {
  id: `provider-smoke-${Date.now()}`,
  idempotencyKey: `provider-smoke:${Date.now()}`,
  agentId: process.env.AI_AGENT_ID ?? "1",
  taskHash: "provider-smoke",
  prompt: process.env.AI_PROVIDER_SMOKE_PROMPT ?? "Reply with a short sentence confirming that the AI Hub provider connection works.",
  reward: "0",
  trigger: "manual",
  status: "running",
  attempts: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const result = await executor.execute(job);
console.log("AI provider smoke test passed");
console.log(`model=${model}`);
console.log(`resultHash=${result.resultHash}`);
console.log(`output=${result.output}`);
