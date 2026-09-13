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
const maxTasks = Number(process.env.DROP_HUNTER_AGENT_MAX_TASKS ?? 10);
const targets = parseHttpCheckInTargetsJson(process.env.DROP_HUNTER_CHECKIN_TARGETS_JSON);

if (!Number.isInteger(maxTasks) || maxTasks < 1 || maxTasks > 100) {
  throw new Error("DROP_HUNTER_AGENT_MAX_TASKS must be between 1 and 100");
}

const store = new JsonFileDropHunterProductStore(storePath);
const repository = new DropHunterProjectRepository(store);
const evidence = new JsonFileDropHunterEvidenceStore(evidencePath);
const policy = new DropTaskAutomationPolicy({
  maxAutonomousCostUsd: Number(process.env.DROP_HUNTER_MAX_AUTONOMOUS_COST_USD ?? 0),
  allowAutonomousGas: false,
  allowAutonomousWalletActions: false,
});
const control = new DropHunterProductControlPlane(store, repository, undefined, policy, () => new Date(), evidence);

const executors: DropHunterAgentTaskExecutor[] = [];
if (targets.length > 0) {
  const checkIn = new HttpCheckInExecutor({ targets });
  const supportedProjects = new Set(targets.map((target) => target.projectId));
  executors.push({
    kinds: checkIn.kinds,
    supports(context: DropHunterAgentTaskExecutionContext) {
      return supportedProjects.has(context.projectId);
    },
    execute(context) {
      return checkIn.execute(context);
    },
  });
}

const runner = new DropHunterAgentTaskRunner(control, executors, { maxTasksPerRun: maxTasks });
const result = await runner.runOnce();

console.log("AI Hub Drop Hunter — autonomous agent cycle");
console.log(`Considered: ${result.considered}`);
console.log(`Executed: ${result.executed}`);
console.log(`Completed: ${result.completed}`);
console.log(`Failed: ${result.failed}`);
console.log(`Skipped/unsupported: ${result.skipped}`);
for (const record of result.records) {
  console.log(`- ${record.projectId} / ${record.taskId}: ${record.result.status}${record.result.note ? ` — ${record.result.note}` : ""}`);
}
