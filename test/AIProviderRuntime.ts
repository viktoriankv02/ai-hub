import { expect } from "chai";
import { AIProviderError, OpenAICompatibleProvider } from "../agents/ai-jobs/providers/index.js";

describe("AI provider runtime", function () {
  it("returns text and provider metadata", async function () {
    const provider = new OpenAICompatibleProvider({
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: async () => new Response(JSON.stringify({
        id: "req-123",
        model: "test-model",
        choices: [{ message: { content: " hello world " } }],
        usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
      }), { status: 200, headers: { "x-request-id": "req-123" } }),
    });

    const result = await provider.execute({
      model: "test-model",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.output).to.equal("hello world");
    expect(result.requestId).to.equal("req-123");
    expect(result.usage?.totalTokens).to.equal(6);
  });

  it("retries transient provider failures", async function () {
    let calls = 0;
    const provider = new OpenAICompatibleProvider({
      apiKey: "test-key",
      model: "test-model",
      maxRetries: 2,
      retryBaseDelayMs: 0,
      retryMaxDelayMs: 0,
      fetchImpl: async () => {
        calls += 1;
        if (calls < 3) return new Response(JSON.stringify({ error: { message: "busy" } }), { status: 429 });
        return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
      },
    });

    const result = await provider.execute({ model: "test-model", messages: [{ role: "user", content: "run" }] });
    expect(result.output).to.equal("ok");
    expect(calls).to.equal(3);
  });

  it("does not retry non-transient provider failures", async function () {
    let calls = 0;
    const provider = new OpenAICompatibleProvider({
      apiKey: "test-key",
      model: "test-model",
      maxRetries: 3,
      retryBaseDelayMs: 0,
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400 });
      },
    });

    let failure: unknown;
    try {
      await provider.execute({ model: "test-model", messages: [{ role: "user", content: "run" }] });
    } catch (error) {
      failure = error;
    }

    expect(failure).to.be.instanceOf(AIProviderError);
    expect((failure as AIProviderError).retryable).to.equal(false);
    expect(calls).to.equal(1);
  });
});
