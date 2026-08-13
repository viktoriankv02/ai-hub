import { spawn, type ChildProcess } from "node:child_process";
import { request } from "node:http";

const host = process.env.AI_JOB_API_HOST ?? "127.0.0.1";
const port = Number(process.env.AI_JOB_API_PORT ?? 8787);
const base = `http://${host}:${port}`;
const token = process.env.AI_JOB_API_TOKEN;

function call(method: string, path: string, body?: unknown) {
  const url = new URL(path, base);
  const payload = body === undefined ? undefined : JSON.stringify(body);

  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = request(
      url,
      {
        method,
        headers: {
          ...(payload ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed: unknown;
          try {
            parsed = raw ? JSON.parse(raw) : undefined;
          } catch {
            parsed = raw;
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function isHealthy(): Promise<boolean> {
  try {
    const result = await call("GET", "/health");
    return result.status === 200;
  } catch {
    return false;
  }
}

async function waitForHealth(timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isHealthy()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`AI job API did not become healthy at ${base}`);
}

function startServer(): ChildProcess {
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tsx", "scripts/ai-job-server.ts"],
    {
      stdio: "inherit",
      env: process.env,
    },
  );

  child.once("error", (error) => {
    console.error("AI job server failed to start", error);
  });

  return child;
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;

  if (process.platform === "win32" && child.pid) {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
      });
      killer.once("exit", () => resolve());
      killer.once("error", () => resolve());
    });
    return;
  }

  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const alreadyRunning = await isHealthy();
const server = alreadyRunning ? undefined : startServer();

try {
  await waitForHealth();

  const suffix = Date.now();
  const created = await call("POST", "/jobs", {
    idempotencyKey: `smoke:auto:${suffix}`,
    agentId: process.env.AI_AGENT_ID ?? "1",
    taskHash: `smoke-task-${suffix}`,
    prompt: "Perform a deterministic AI Hub control-plane smoke test.",
    reward: process.env.AI_JOB_REWARD ?? "0",
    trigger: "manual",
    metadata: {
      smoke: "true",
      mode: "auto",
    },
  });

  if (created.status !== 201) {
    throw new Error(`Job creation failed: ${created.status} ${JSON.stringify(created.body)}`);
  }

  const id = created.body?.job?.id;
  if (typeof id !== "string") {
    throw new Error(`Job creation returned an invalid job id: ${JSON.stringify(created.body)}`);
  }

  const completed = await call("POST", `/jobs/${encodeURIComponent(id)}/run`);
  if (completed.status !== 200 || completed.body?.job?.status !== "completed") {
    throw new Error(`Job execution failed: ${completed.status} ${JSON.stringify(completed.body)}`);
  }

  console.log("AI job HTTP smoke test passed");
  console.log(`job=${id}`);
  console.log(`status=${completed.body.job.status}`);
  console.log(`resultHash=${completed.body.job.resultHash}`);
} finally {
  if (server) await stopServer(server);
}
