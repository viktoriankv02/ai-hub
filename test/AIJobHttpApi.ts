import { expect } from "chai";
import { request } from "node:http";
import {
  AIJobHttpApi,
  AIJobOrchestrator,
  AIJobService,
  DryRunAIExecutor,
  InMemoryAIJobStore,
} from "../agents/ai-jobs/index.js";

interface HttpResult {
  status: number;
  body: any;
}

function httpRequest(
  port: number,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request({
      host: "127.0.0.1",
      port,
      path,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
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

describe("AIJobHttpApi", function () {
  it("creates, reads, runs and drains jobs through HTTP", async function () {
    const orchestrator = new AIJobOrchestrator(new InMemoryAIJobStore(), {
      idFactory: () => "http-job-1",
    });
    const service = new AIJobService(orchestrator, new DryRunAIExecutor(), { batchSize: 5 });
    const api = new AIJobHttpApi(service);
    const server = api.createServer();

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not expose a port");
    const port = address.port;

    try {
      const health = await httpRequest(port, "GET", "/health");
      expect(health.status).to.equal(200);
      expect(health.body.status).to.equal("ok");

      const created = await httpRequest(port, "POST", "/jobs", {
        idempotencyKey: "http-key",
        agentId: "1",
        taskHash: "task-http",
        prompt: "execute test job",
        reward: "100",
      });
      expect(created.status).to.equal(201);
      expect(created.body.job.id).to.equal("http-job-1");
      expect(created.body.job.status).to.equal("queued");

      const fetched = await httpRequest(port, "GET", "/jobs/http-job-1");
      expect(fetched.status).to.equal(200);
      expect(fetched.body.job.id).to.equal("http-job-1");

      const run = await httpRequest(port, "POST", "/jobs/http-job-1/run");
      expect(run.status).to.equal(200);
      expect(run.body.job.status).to.equal("completed");
      expect(run.body.job.resultHash).to.match(/^dry-run:/);

      const jobs = await httpRequest(port, "GET", "/jobs");
      expect(jobs.status).to.equal(200);
      expect(jobs.body.jobs).to.have.length(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("enforces an optional bearer token", async function () {
    const service = new AIJobService(new AIJobOrchestrator(), new DryRunAIExecutor());
    const api = new AIJobHttpApi(service, { token: "secret" });
    const server = api.createServer();

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not expose a port");
    const port = address.port;

    try {
      const denied = await httpRequest(port, "GET", "/health");
      expect(denied.status).to.equal(401);

      const allowed = await httpRequest(port, "GET", "/health", undefined, "secret");
      expect(allowed.status).to.equal(200);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("returns 404 for unknown jobs and routes", async function () {
    const service = new AIJobService(new AIJobOrchestrator(), new DryRunAIExecutor());
    const api = new AIJobHttpApi(service);
    const server = api.createServer();

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not expose a port");
    const port = address.port;

    try {
      expect((await httpRequest(port, "GET", "/jobs/missing")).status).to.equal(404);
      expect((await httpRequest(port, "GET", "/unknown")).status).to.equal(404);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
