import { PRIORITY_OPPORTUNITIES, createReport } from "../agents/drop-hunter/index.js";

const report = createReport(PRIORITY_OPPORTUNITIES);

console.log("AI Hub Drop Hunter — one scan");
console.log(`Generated: ${report.generatedAt}`);
console.log(`Opportunities: ${report.opportunities.length}`);
console.log("");

for (const [index, opportunity] of report.opportunities.entries()) {
  console.log(
    `${index + 1}. ${opportunity.name} | score=${opportunity.score} | confidence=${opportunity.confidence} | priority=${opportunity.priority}`,
  );
  if (opportunity.reasons.length > 0) {
    console.log(`   reasons: ${opportunity.reasons.join("; ")}`);
  }
  if (opportunity.actions.length > 0) {
    console.log(`   actions: ${opportunity.actions.join(" | ")}`);
  }
}
