import type { DropTaskKind } from "./task-model.js";
import type { DropHunterEvidenceRecord } from "./evidence-history.js";

export interface DropHunterLearningSignals {
  taskKindSuccessRate: Partial<Record<DropTaskKind, number>>;
  taskKindRewardRate: Partial<Record<DropTaskKind, number>>;
  sourceSuccessRate: Record<string, number>;
  projectSuccessRate: Record<string, number>;
  totalRecords: number;
  rewardedRecords: number;
}

interface Counter {
  total: number;
  success: number;
  rewarded: number;
}

export function deriveLearningSignals(records: readonly DropHunterEvidenceRecord[]): DropHunterLearningSignals {
  const byKind = new Map<DropTaskKind, Counter>();
  const bySource = new Map<string, Counter>();
  const byProject = new Map<string, Counter>();

  for (const record of records) {
    update(byKind, record.taskKind, record);
    if (record.source?.trim()) update(bySource, record.source.trim(), record);
    update(byProject, record.projectId, record);
  }

  const taskKindSuccessRate: Partial<Record<DropTaskKind, number>> = {};
  const taskKindRewardRate: Partial<Record<DropTaskKind, number>> = {};
  for (const [kind, counter] of byKind) {
    taskKindSuccessRate[kind] = rate(counter.success, counter.total);
    taskKindRewardRate[kind] = rate(counter.rewarded, counter.total);
  }

  return {
    taskKindSuccessRate,
    taskKindRewardRate,
    sourceSuccessRate: Object.fromEntries([...bySource].map(([key, counter]) => [key, rate(counter.success, counter.total)])),
    projectSuccessRate: Object.fromEntries([...byProject].map(([key, counter]) => [key, rate(counter.success, counter.total)])),
    totalRecords: records.length,
    rewardedRecords: records.filter((record) => record.rewardOutcome === "rewarded").length,
  };
}

export function learningAdjustment(input: {
  projectId: string;
  taskKind?: DropTaskKind;
  source?: string;
  signals: DropHunterLearningSignals;
}): number {
  const values: number[] = [];
  const project = input.signals.projectSuccessRate[input.projectId];
  if (project !== undefined) values.push(project);
  if (input.taskKind) {
    const success = input.signals.taskKindSuccessRate[input.taskKind];
    const reward = input.signals.taskKindRewardRate[input.taskKind];
    if (success !== undefined) values.push(success);
    if (reward !== undefined) values.push(reward);
  }
  if (input.source) {
    const source = input.signals.sourceSuccessRate[input.source];
    if (source !== undefined) values.push(source);
  }
  if (values.length === 0) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round((average - 0.5) * 20);
}

function update<K>(map: Map<K, Counter>, key: K, record: DropHunterEvidenceRecord): void {
  const counter = map.get(key) ?? { total: 0, success: 0, rewarded: 0 };
  counter.total += 1;
  if (record.outcome === "success") counter.success += 1;
  if (record.rewardOutcome === "rewarded") counter.rewarded += 1;
  map.set(key, counter);
}

function rate(value: number, total: number): number {
  return total === 0 ? 0 : Number((value / total).toFixed(4));
}
