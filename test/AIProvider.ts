import { expect } from "chai";
import { OpenAICompatibleProvider } from "../agents/ai-jobs/providers/openai-compatible.js";
import { AIProviderJobExecutor } from "../agents/ai-jobs/executor.js";
import type { AIJobRecord } from "../agents/ai-jobs/types.js";

const job: AIJobRecord = {
  id: "job_provider_1",
  idempotencyKey: "provider:test:1",
  agentId: "1",
  taskHash: "fnv1a:12345678",
  prompt: "Summarize the target in one sentence.",
  reward: "0",
  trigger: "manual",
  status: "queued",
  attempts: 0,
  createdAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
};

describe("OpenAI-compatible AI provider", function () {
  it("sends the job prompt and returns assistant text", async function () {
    let requestUrl = "";
    let requestBody: any;
    const provider = new OpenAICompatibleProvider({
      apiKey: "test-key",
      baseUrl: "https://provider.test/v1",
      model: "test-model",
      systemPrompt: "You are a deterministic test agent.",
      temperature: 0,
      maxTokens: 64,
      fetchImpl: async (input, init) => {
        requestUrl = String(input);
        requestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          choices: [{ message: { content: "Provider response" } }],
        }), { status: 200 });
      },
    });

    const output = await provider.executePrompt(job);

    expect(output).to.equal("Provider response");
    expect(requestUrl).to.equal("https://provider.test/v1/chat/completions");
    expect(requestBody.model).to.equal("test-model");
    expect(requestBody.temperature).to.equal(0);
    expect(requestBody.max_tokens).to.equal(64);
    expect(requestBody.messages).to.deep.equal([
      { role: "system", content: "You are a deterministic test agent." },
      { role: "user", content: job.prompt },
    ]);
  });

  it("converts provider output into a canonical result hash", async function () {
    const executor = new AIProviderJobExecutor({
      executePrompt: async () => "stable output",
    });

    const result = await executor.execute(job);

    expect(result.output).to.equal("stable output");
    expect(result.resultHash).to.match(/^sha256:[0-9a-f]{64}$/);
  });

  it("surfaces provider HTTP failures without leaking the API key", async function () {
    const provider = new OpenAICompatibleProvider({
      apiKey: "super-secret-key",
      model: "test-model",
      fetchImpl: async () => new Response(
        JSON.stringify({ error: { message: "invalid model" } }),
        { status: 400 },
      ),
    });

    let error: unknown;
    try {
      await provider.executePrompt(job);
    } catch (value) {
      error = value;
    }

    expect(error).to.be.instanceOf(Error);
    expect((error as Error).message).to.equal("AI provider HTTP 400: invalid model");
    expect((error as Error).message).not.to.contain("super-secret-key");
  });
});
