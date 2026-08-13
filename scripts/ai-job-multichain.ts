import { createServer } from "node:http";
import { resolve } from "node:path";
import { AIJobMultiChainExecutor } from "../agents/ai-jobs/multi-chain-runtime.js";
import { AIJobMultiChainService } from "../agents/ai-jobs/multi-chain-service.js";
import { AIJobOrchestrator } from "../agents/ai-jobs/orchestrator.js";
import { AIJobService } from "../agents/ai-jobs/service.js";
import { createAIJobExecutor } from "../agents/ai-jobs/executor.js";
import { JsonFileAIJobStore } from "../agents/ai-jobs/json-store.js";
import { createMultiChainRuntime, defaultMultiChainTargetsFromEnv } from "../agents/ai-jobs/multi-chain-runtime.js";
import { AIJobHttpApi } from "../agents/ai-jobs/http-api.js";

const port = Number(process.env.AI_JOB_API_PORT ?? 8787);
const host = process.env.AI_JOB_API_HOST ?? "127.0.0.1";
const token = process.env.AI_JOB_API_TOKEN?.trim() || undefined;
const batchSize = Number(process.env.AI_JOB_BATCH_SIZE ?? 5);
const maxAttempts = Number(process.env.AI_JOB_MAX_ATTEMPTS ?? 3);
const storePath = resolve(process.env.AI_JOB_STORE ?? "./data/ai-jobs.json");

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("AI_JOB_API_PORT must be a valid TCP port");
if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("AI_JOB_BATCH_SIZE must be a positive integer");
if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error("AI_JOB_MAX_ATTEMPTS must be a positive integer");

const targets = defaultMultiChainTargetsFromEnv();
if (targets.length === 0) throw new Error("no AI job chain targets configured");

const runtime = createMultiChainRuntime({ targets, defaultTarget: process.env.AI_JOB_DEFAULT_CHAIN_TARGET });
const chain = new AIJobMultiChainService(new AIJobMultiChainExecutor(runtime));
const store = new JsonFileAIJobStore(storePath);
const orchestrator = new AIJobOrchestrator(store, { maxAttempts });
const executor = createAIJobExecutor();
const service = new AIJobService(orchestrator, executor, { batchSize });
const baseApi = new AIJobHttpApi(service, { token });

const http = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  void handle(req, res);
});

async function handle(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (req.method === "OPTIONS") return res.end();
  if (token && req.headers.authorization !== `Bearer ${token}`) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: "unauthorized" }));
  }

  if (req.method === "GET" && path === "/chains") {
    return send(res, 200, { chains: chain.targets(), defaultTarget: runtime.defaultTarget });
  }

  const match = path.match(/^\/jobs\/([^/]+)\/chain\/(provision|complete|execute)$/);
  if (match && req.method === "POST") {
    const job = service.get(decodeURIComponent(match[1]));
    if (!job) return send(res, 404, { error: "job_not_found" });
    try {
      const targetId = url.searchParams.get("targetId") ?? job.chainTargetId;
      const result = match[2] === "provision"
        ? await chain.provision(job, targetId)
        : match[2] === "complete"
          ? await chain.complete(job, targetId)
          : await chain.execute(job, targetId);
      return send(res, 200, { result });
    } catch (error) {
      return send(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  return baseApi.handle(req, res);
}

function send(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

http.listen(port, host, () => {
  console.log(`AI Hub multi-chain control plane: http://${host}:${port}`);
  console.log(`targets=${runtime.registry.list().map((item) => `${item.id}:${item.chainId}`).join(",")}`);
  console.log(`defaultTarget=${runtime.defaultTarget ?? "none"}`);
});

const shutdown = () => http.close(() => process.exit(0));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
