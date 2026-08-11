import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PRIORITY_OPPORTUNITIES, StaticOpportunitySource, createDropHunterRuntime } from "../agents/drop-hunter/index.js";

const outputFile = resolve(process.env.DROP_HUNTER_REPORT_FILE ?? "./.data/drop-hunter/latest.json");
await mkdir(dirname(outputFile), { recursive: true });

const runtime = await createDropHunterRuntime(
  [new StaticOpportunitySource("priority-catalog", "AI Hub priority catalog", PRIORITY_OPPORTUNITIES)],
  {
    stateFile: process.env.DROP_HUNTER_STATE_FILE,
    executionFile: process.env.DROP_HUNTER_EXECUTION_FILE,
    scheduler: { intervalMs: 86_400_000 },
  },
);

const cycle = await runtime.scanOnce();
const report = {
  generatedAt: cycle.timestamp,
  failedSources: cycle.failedSources,
  opportunities: cycle.cycles.map(item => ({
    id: item.opportunity.id,
    name: item.opportunity.name,
    chainId: item.opportunity.chainId,
    stage: item.opportunity.stage,
    score: item.opportunity.score,
    confidence: item.opportunity.confidence,
    priority: item.opportunity.priority,
    lifecycle: item.snapshot.lifecycle,
    reasons: item.opportunity.reasons,
    actions: item.actions.map(action => ({ id: action.id, title: action.title, completed: action.completed, risk: action.risk })),
    evidence: item.evidenceSummaries,
  })),
};
await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Drop Hunter report written to ${outputFile}`);
console.log(`opportunities=${report.opportunities.length} failedSources=${report.failedSources.length}`);
