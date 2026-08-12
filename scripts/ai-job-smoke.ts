import { request } from "node:http";

const base = `http://${process.env.AI_JOB_API_HOST ?? "127.0.0.1"}:${process.env.AI_JOB_API_PORT ?? 8787}`;
const token = process.env.AI_JOB_API_TOKEN;

async function call(method: string, path: string, body?: unknown) {
  const url = new URL(path, base);
  const payload = body === undefined ? undefined : JSON.stringify(body);

  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = request(url, {
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : undefined });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const health = await call("GET", "/health");
if (health.status !== 200) throw new Error(`Health check failed: ${health.status}`);

const created = await call("POST", "/jobs", {
  idempotencyKey: `smoke:${Date.now()}`,
  agentId: process.env.AI_AGENT_ID ?? "1",
  taskHash: `smoke-task-${Date.now()}`,
  prompt: "Perform a deterministic AI Hub control-plane smoke test.",
  reward: process.env.AI_JOB_REWARD ?? "0",
  trigger: "manual",
});

if (created.status !== 201) {
  throw new Error(`Job creation failed: ${created.status} ${JSON.stringify(created.body)}`);
}

const id = created.body.job.id as string;
const completed = await call("POST", `/jobs/${encodeURIComponent(id)}/run`);
if (completed.status !== 200 || completed.body.job.status !== "completed") {
  throw new Error(`Job execution failed: ${completed.status} ${JSON.stringify(completed.body)}`);
}

console.log("AI job HTTP smoke test passed");
console.log(`job=${id}`);
console.log(`status=${completed.body.job.status}`);
console.log(`resultHash=${completed.body.job.resultHash}`);
