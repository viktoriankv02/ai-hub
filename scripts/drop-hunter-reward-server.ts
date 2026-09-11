import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  DropHunterRewardEvidenceBridge,
  DropHunterRewardService,
  JsonFileDropHunterEvidenceStore,
  JsonFileDropHunterRewardStore,
  type DropHunterRewardSource,
  type DropHunterRewardStatus,
} from "../agents/drop-hunter/index.js";

const port = Number(process.env.DROP_HUNTER_REWARD_API_PORT ?? 8788);
const storePath = process.env.DROP_HUNTER_REWARD_PATH ?? "data/drop-hunter-rewards.json";
const evidencePath = process.env.DROP_HUNTER_EVIDENCE_PATH ?? "data/drop-hunter-evidence.json";
const statuses = new Set<DropHunterRewardStatus>(["detected", "claimable", "claimed", "confirmed", "dismissed"]);
const sources = new Set<DropHunterRewardSource>(["onchain", "campaign", "manual", "unknown"]);

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("DROP_HUNTER_REWARD_API_PORT must be a valid TCP port");

const store = new JsonFileDropHunterRewardStore(storePath);
const rewards = new DropHunterRewardService(store);
const evidence = new JsonFileDropHunterEvidenceStore(evidencePath);
const rewardEvidence = new DropHunterRewardEvidenceBridge(rewards);

createServer(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return send(res, 204, undefined);
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    const path = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

    if (req.method === "GET" && path.length === 1 && path[0] === "health") {
      return send(res, 200, { ok: true, service: "drop-hunter-rewards", storePath, evidencePath });
    }
    if (req.method === "GET" && path.length === 1 && path[0] === "rewards") {
      const projectId = url.searchParams.get("projectId") ?? undefined;
      const statusRaw = url.searchParams.get("status") ?? undefined;
      if (statusRaw && !statuses.has(statusRaw as DropHunterRewardStatus)) return send(res, 400, { error: "invalid reward status" });
      return send(res, 200, { rewards: await rewards.list({ projectId, status: statusRaw as DropHunterRewardStatus | undefined }) });
    }
    if (req.method === "GET" && path.length === 2 && path[0] === "rewards" && path[1] === "summary") {
      return send(res, 200, { summary: await rewards.summary(url.searchParams.get("projectId") ?? undefined) });
    }
    if (req.method === "GET" && path.length === 2 && path[0] === "rewards") {
      const reward = await rewards.get(path[1]);
      if (!reward) return send(res, 404, { error: `drop hunter reward not found: ${path[1]}` });
      return send(res, 200, { reward });
    }
    if (req.method === "POST" && path.length === 2 && path[0] === "rewards" && path[1] === "sync-evidence") {
      const records = await evidence.list();
      const synced = await rewardEvidence.ingestMany(records);
      return send(res, 200, { scanned: records.length, synced: synced.length, rewards: synced });
    }
    if (req.method === "POST" && path.length === 1 && path[0] === "rewards") {
      const body = await readJson(req);
      if (typeof body.projectId !== "string" || !body.projectId.trim()) return send(res, 400, { error: "projectId is required" });
      if (typeof body.status !== "string" || !statuses.has(body.status as DropHunterRewardStatus)) return send(res, 400, { error: "invalid reward status" });
      if (typeof body.source !== "string" || !sources.has(body.source as DropHunterRewardSource)) return send(res, 400, { error: "invalid reward source" });
      const reward = await rewards.detect({
        projectId: body.projectId,
        taskId: stringValue(body.taskId),
        chainId: numberValue(body.chainId),
        status: body.status as DropHunterRewardStatus,
        source: body.source as DropHunterRewardSource,
        assetSymbol: stringValue(body.assetSymbol),
        assetAddress: stringValue(body.assetAddress),
        amount: stringValue(body.amount),
        estimatedUsd: numberValue(body.estimatedUsd),
        confidence: numberValue(body.confidence),
        reference: stringValue(body.reference),
        note: stringValue(body.note),
      });
      return send(res, 201, { reward });
    }
    if (req.method === "POST" && path.length === 3 && path[0] === "rewards" && path[2] === "status") {
      const body = await readJson(req);
      if (typeof body.status !== "string" || !statuses.has(body.status as DropHunterRewardStatus)) return send(res, 400, { error: "invalid reward status" });
      return send(res, 200, { reward: await rewards.setStatus(path[1], body.status as DropHunterRewardStatus, stringValue(body.note)) });
    }

    return send(res, 404, { error: "route not found" });
  } catch (error) {
    return send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Drop Hunter Rewards API: http://127.0.0.1:${port}`);
  console.log(`Rewards store: ${storePath}`);
});

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3000");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}
function send(res: ServerResponse, status: number, value: unknown): void {
  if (status === 204) {
    res.writeHead(status);
    res.end();
    return;
  }
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(`${JSON.stringify(value)}\n`);
}
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error("request body is too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("request body must be a JSON object");
  return parsed as Record<string, unknown>;
}
