import { request } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";

const host = process.env.AI_JOB_API_HOST ?? "127.0.0.1";
const port = Number(process.env.AI_JOB_API_PORT ?? 8787);
const base = `http://${host}:${port}`;
const token = process.env.AI_JOB_API_TOKEN;
const autoStart = process.env.AI_JOB_SMOKE_AUTOSTART !== "0";

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
        let parsed: any = undefined;
        if (raw) {
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = { raw };
          }
        }
        resolve({ status: res.statusCode ?? 0, body: parsed });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForHealth(timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "unknown error";

  while (Date.now() < deadline) {
    try {
      const health = await call("GET", "/health");
      if (health.status === 200) return;
      lastError = `HTTP ${health.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`AI job server did not become healthy: ${lastError}`);
}

function startServer(): ChildProcess {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  return spawn(command, ["tsx", "scripts/ai-job-server.ts"], {
    stdio: "inherit",
    env: process.env,
  });
}

let child: ChildProcess | undefined;

try {
  try {
    await waitForHealth(500);
  } catch (error) {
    if (!autoStart) throw error;
    console.log("AI job server is not running; starting a temporary local server...");
    child = startServer();
    await waitForHealth();
  }

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
} finally {
  if (child && !child.killed) {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1_000);
      child?.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
