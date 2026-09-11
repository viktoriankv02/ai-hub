import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  ContractDeploymentPreviewBuilder,
  DropHunterAttentionQueue,
  DropHunterContractDeploymentEngine,
  DropHunterContractTemplateCatalog,
  DropHunterProductControlPlane,
  DropHunterProductIngestionService,
  DropHunterProjectRepository,
  DropTaskAutomationPolicy,
  GitHubRepositoryOpportunitySource,
  HardhatJsonArtifactLoader,
  JsonFileDropHunterEvidenceStore,
  JsonFileDropHunterProductStore,
  OpportunityDiscoveryRegistry,
  PRIORITY_OPPORTUNITIES,
  StaticOpportunitySource,
  deriveLearningSignals,
  type DiscoverySource,
  type DropHunterContractTemplateId,
  type DropHunterProjectStatus,
  type DropHunterTaskStatus,
} from "../agents/drop-hunter/index.js";
import { OfficialPageOpportunitySource, parseOfficialPagesJson } from "../agents/drop-hunter/official-page-opportunity-source.js";
import { getDropHunterChainReadiness } from "../agents/drop-hunter/chain-readiness.js";

const port = Number(process.env.DROP_HUNTER_API_PORT ?? 8787);
const storePath = process.env.DROP_HUNTER_STORE_PATH ?? "data/drop-hunter-projects.json";
const evidencePath = process.env.DROP_HUNTER_EVIDENCE_PATH ?? "data/drop-hunter-evidence.json";
const queries = (process.env.DROP_HUNTER_GITHUB_QUERIES ?? "incentivized testnet")
  .split(",")
  .map((query) => query.trim())
  .filter(Boolean);
const maxResults = Number(process.env.DROP_HUNTER_GITHUB_MAX_RESULTS ?? 10);
const maxAutonomousCostUsd = Number(process.env.DROP_HUNTER_MAX_AUTONOMOUS_COST_USD ?? 0);
const allowAutonomousGas = process.env.DROP_HUNTER_ALLOW_AUTONOMOUS_GAS === "true";
const allowAutonomousWallet = process.env.DROP_HUNTER_ALLOW_AUTONOMOUS_WALLET === "true";
const officialPages = parseOfficialPagesJson(process.env.DROP_HUNTER_OFFICIAL_PAGES_JSON);

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("DROP_HUNTER_API_PORT must be a valid TCP port");
if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 100) throw new Error("DROP_HUNTER_GITHUB_MAX_RESULTS must be between 1 and 100");
if (!Number.isFinite(maxAutonomousCostUsd) || maxAutonomousCostUsd < 0) throw new Error("DROP_HUNTER_MAX_AUTONOMOUS_COST_USD must be non-negative");

const policy = new DropTaskAutomationPolicy({
  maxAutonomousCostUsd,
  allowAutonomousGas,
  allowAutonomousWalletActions: allowAutonomousWallet,
});
const store = new JsonFileDropHunterProductStore(storePath);
const evidence = new JsonFileDropHunterEvidenceStore(evidencePath);
const repository = new DropHunterProjectRepository(store);
const sources: DiscoverySource[] = [
  new StaticOpportunitySource("priority-catalog", "AI Hub priority catalog", PRIORITY_OPPORTUNITIES),
  new GitHubRepositoryOpportunitySource({ queries, maxResults, token: process.env.GITHUB_TOKEN }),
];
if (officialPages.length > 0) sources.push(new OfficialPageOpportunitySource({ pages: officialPages }));
const discovery = new OpportunityDiscoveryRegistry(sources);
const ingestion = new DropHunterProductIngestionService(discovery, repository, policy);
const control = new DropHunterProductControlPlane(store, repository, ingestion, policy, () => new Date(), evidence);
const attention = new DropHunterAttentionQueue(policy);
const contractTemplates = new DropHunterContractTemplateCatalog();
const deploymentEngine = new DropHunterContractDeploymentEngine(contractTemplates);
const deploymentPreview = new ContractDeploymentPreviewBuilder(new HardhatJsonArtifactLoader());

const PROJECT_STATUSES = new Set<DropHunterProjectStatus>(["new", "active", "paused", "completed", "archived"]);
const TASK_STATUSES = new Set<DropHunterTaskStatus>(["pending", "ready", "running", "waiting-approval", "completed", "failed", "skipped"]);
const TEMPLATE_IDS = new Set<DropHunterContractTemplateId>(["counter", "erc20", "erc721"]);

createServer(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return send(res, 204, undefined);

  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    const path = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

    if (req.method === "GET" && path.length === 1 && path[0] === "health") {
      return send(res, 200, { ok: true, service: "drop-hunter", storePath, evidencePath, officialPages: officialPages.length });
    }
    if (req.method === "GET" && path.length === 1 && path[0] === "dashboard") {
      return send(res, 200, await control.dashboard());
    }
    if (req.method === "GET" && path.length === 1 && path[0] === "chains") {
      return send(res, 200, { chains: getDropHunterChainReadiness() });
    }
    if (req.method === "GET" && path.length === 1 && path[0] === "sources") {
      return send(res, 200, { sources: discovery.statuses() });
    }
    if (req.method === "GET" && path.length === 1 && path[0] === "attention") {
      return send(res, 200, { items: attention.build(await control.listProjects()) });
    }
    if (req.method === "GET" && path.length === 1 && path[0] === "contract-templates") {
      return send(res, 200, { templates: contractTemplates.list() });
    }
    if (req.method === "GET" && path.length === 1 && path[0] === "history") {
      const projectId = url.searchParams.get("projectId");
      const taskId = url.searchParams.get("taskId");
      const limitRaw = Number(url.searchParams.get("limit") ?? 100);
      const limit = Number.isInteger(limitRaw) ? Math.max(1, Math.min(500, limitRaw)) : 100;
      let records = projectId
        ? taskId ? await evidence.listTask(projectId, taskId) : await evidence.listProject(projectId)
        : await evidence.list();
      records = records.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id.localeCompare(a.id)).slice(0, limit);
      return send(res, 200, { records, count: records.length });
    }
    if (req.method === "GET" && path.length === 1 && path[0] === "learning") {
      const records = await evidence.list();
      return send(res, 200, { signals: deriveLearningSignals(records) });
    }
    if (req.method === "GET" && path.length === 1 && path[0] === "projects") {
      return send(res, 200, { projects: await control.listProjects() });
    }
    if (req.method === "GET" && path.length === 2 && path[0] === "projects") {
      const project = await control.getProject(path[1]);
      if (!project) return send(res, 404, { error: `drop hunter project not found: ${path[1]}` });
      return send(res, 200, { project });
    }
    if (req.method === "GET" && path.length === 1 && path[0] === "tasks") {
      const mode = url.searchParams.get("mode") as "autonomous" | "approval" | "manual" | "disabled" | null;
      if (mode && !new Set(["autonomous", "approval", "manual", "disabled"]).has(mode)) {
        return send(res, 400, { error: `invalid automation mode: ${mode}` });
      }
      return send(res, 200, { tasks: await control.taskQueue(mode ?? undefined) });
    }
    if (req.method === "POST" && path.length === 1 && path[0] === "scan") {
      const result = await control.scan();
      return send(res, 200, {
        discoveredAt: result.discoveredAt,
        discovered: result.discovery.opportunities.length,
        successfulSources: result.discovery.successfulSources,
        failedSources: result.discovery.failedSources,
        storedProjects: result.projects.length,
        warnings: result.warnings,
      });
    }
    if (req.method === "POST" && path.length === 5 && path[0] === "projects" && path[2] === "tasks" && path[4] === "deployment-preview") {
      const project = await control.getProject(path[1]);
      if (!project) return send(res, 404, { error: `drop hunter project not found: ${path[1]}` });
      const task = project.tasks.find((item) => item.id === path[3]);
      if (!task) return send(res, 404, { error: `drop hunter task not found: ${path[3]}` });
      const body = await readJson(req);
      const templateId = typeof body.templateId === "string" && TEMPLATE_IDS.has(body.templateId as DropHunterContractTemplateId)
        ? body.templateId as DropHunterContractTemplateId
        : undefined;
      const constructorArgs = Array.isArray(body.constructorArgs) ? body.constructorArgs : undefined;
      const plan = deploymentEngine.plan(project, task, { templateId, constructorArgs, env: process.env });
      const preview = await deploymentPreview.build(plan);
      return send(res, 200, {
        preview,
        chain: { key: plan.chain.key, name: plan.chain.name, chainId: plan.chain.chainId, explorerUrl: plan.explorerUrl },
        template: plan.template,
        blockers: plan.blockers,
      });
    }
    if (req.method === "POST" && path.length === 3 && path[0] === "projects" && path[2] === "status") {
      const body = await readJson(req);
      const status = body.status;
      if (typeof status !== "string" || !PROJECT_STATUSES.has(status as DropHunterProjectStatus)) {
        return send(res, 400, { error: "invalid project status" });
      }
      return send(res, 200, { project: await control.setProjectStatus(path[1], status as DropHunterProjectStatus) });
    }
    if (req.method === "POST" && path.length === 5 && path[0] === "projects" && path[2] === "tasks" && path[4] === "approve") {
      return send(res, 200, { task: await control.approveTask(path[1], path[3]) });
    }
    if (req.method === "POST" && path.length === 5 && path[0] === "projects" && path[2] === "tasks" && path[4] === "skip") {
      return send(res, 200, { task: await control.skipTask(path[1], path[3]) });
    }
    if (req.method === "POST" && path.length === 5 && path[0] === "projects" && path[2] === "tasks" && path[4] === "status") {
      const body = await readJson(req);
      const status = body.status;
      if (typeof status !== "string" || !TASK_STATUSES.has(status as DropHunterTaskStatus)) {
        return send(res, 400, { error: "invalid task status" });
      }
      const details = {
        error: typeof body.error === "string" ? body.error : undefined,
        txHash: typeof body.txHash === "string" ? body.txHash : undefined,
        contractAddress: typeof body.contractAddress === "string" ? body.contractAddress : undefined,
        blockNumber: typeof body.blockNumber === "number" ? body.blockNumber : undefined,
      };
      return send(res, 200, { task: await control.setTaskStatus(path[1], path[3], status as DropHunterTaskStatus, details) });
    }

    return send(res, 404, { error: "route not found" });
  } catch (error) {
    return send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Drop Hunter API: http://127.0.0.1:${port}`);
  console.log(`Store: ${storePath}`);
  console.log(`Evidence: ${evidencePath}`);
  console.log(`Official pages: ${officialPages.length}`);
});

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
