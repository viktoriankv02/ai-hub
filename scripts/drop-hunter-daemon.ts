import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PRIORITY_OPPORTUNITIES, StaticOpportunitySource, createDropHunterRuntime } from "../agents/drop-hunter/index.js";

const intervalMs = parsePositiveNumber(process.env.DROP_HUNTER_INTERVAL_MS ?? "60000");
const stateFile = resolve(process.env.DROP_HUNTER_STATE_FILE ?? "./.data/drop-hunter/scheduler.json");
await mkdir(dirname(stateFile), { recursive: true });

const source = new StaticOpportunitySource("priority-catalog", "AI Hub priority catalog", PRIORITY_OPPORTUNITIES);
const runtime = createDropHunterRuntime([source], {
  stateFile,
  scheduler: {
    intervalMs,
    now: () => new Date().toISOString(),
    onCycle: cycle => {
      console.log(`[drop-hunter] ${cycle.timestamp} opportunities=${cycle.cycles.length} failedSources=${cycle.failedSources.length}`);
      for (const item of cycle.cycles) {
        console.log(`  ${item.opportunity.name}: score=${item.score} actions=${item.actions.filter(a => !a.completed).length}/${item.actions.length}`);
      }
    },
    onError: error => console.error("[drop-hunter] cycle error", error),
  },
});

const shutdown = () => {
  runtime.stop();
  console.log("[drop-hunter] stopped");
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

console.log(`[drop-hunter] starting interval=${intervalMs}ms state=${stateFile}`);
await runtime.start(true);

function parsePositiveNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("DROP_HUNTER_INTERVAL_MS must be a positive finite number");
  return parsed;
}
