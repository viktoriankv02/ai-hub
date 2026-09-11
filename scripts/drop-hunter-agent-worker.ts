import {
  DropHunterAgentTaskRunner,
  DropHunterProductControlPlane,
  DropHunterProjectRepository,
  DropTaskAutomationPolicy,
  HttpCheckInExecutor,
  JsonFileDropHunterEvidenceStore,
  JsonFileDropHunterProductStore,
  parseHttpCheckInTargetsJson,
  type DropHunterAgentTaskExecutionContext,
  type DropHunterAgentTaskExecutor,
} from "../agents/drop-hunter/index.js";

const storePath = process.env.DROP_HUNTER_STORE_PATH ?? "data/drop-hunter-projects.json";
const evidencePath = process.env.DROP_HUNTER_EVIDENCE_PATH ?? "data/drop-hunter-evidence.json";
const intervalMs = Number(process.env.DROP_HUNTER_AGENT_INTERVAL_MS ?? 300000);
const maxTasks = Number(process.env.DROP_HUNTER_AGENT_MAX_TASKS ?? 10);
const targets = parseHttpCheckInTargetsJson(process.env.DROP_HUNTER_CHECKIN_TARGETS_JSON);

if (!Number.isInteger(intervalMs) || intervalMs < 60000) throw new Error("DROP_HUNTER_AGENT_INTERVAL_MS must be at least 60000");
if (!Number.isInteger(maxTasks) || maxTasks < 1 || maxTasks > 100) throw new Error("DROP_HUNTER_AGENT_MAX_TASKS must be between 1 and 100");

const store = new JsonFileDropHunterProductStore(storePath);
const repository = new DropHunterProjectRepository(store);
const evidence = new JsonFileDropHunterEvidenceStore(evidencePath);
const policy = new DropTaskAutomationPolicy({ maxAutonomousCostUsd: 0, allowAutonomousGas: false, allowAutonomousWalletActions: false });
const control = new DropHunterProductControlPlane(store, repository, undefined, policy, () => new Date(), evidence);

const executors: DropHunterAgentTaskExecutor[] = [];
if (targets.length > 0) {
  const checkIn = new HttpCheckInExecutor({ targets });
  const supportedProjects = new Set(targets.map((target) => target.projectId));
  executors.push({
    kinds: checkIn.kinds,
    supports(context: DropHunterAgentTaskExecutionContext) { return supportedProjects.has(context.projectId); },
    execute(context) { return checkIn.execute(context); },
  });
}
const runner = new DropHunterAgentTaskRunner(control, executors, { maxTasksPerRun: maxTasks });
let running = false;

async function cycle(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await runner.runOnce();
    console.log(`[Drop Hunter agent] considered=${result.considered} executed=${result.executed} completed=${result.completed} failed=${result.failed}`);
  } catch (error) {
    console.error("[Drop Hunter agent] cycle failed:", error instanceof Error ? error.message : String(error));
  } finally {
    running = false;
  }
}

console.log(`Drop Hunter safe agent worker started; interval=${intervalMs}ms; trustedCheckIns=${targets.length}`);
await cycle();
const timer = setInterval(() => void cycle(), intervalMs);

function shutdown(): void {
  clearInterval(timer);
  process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
