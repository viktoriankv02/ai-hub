import type { StoredDropTask } from "./product-store.js";

export function nextTaskRunAt(task: Pick<StoredDropTask, "recurrence" | "recurrenceInterval" | "completedAt" | "updatedAt">): string | undefined {
  if (!task.recurrence || task.recurrence === "once") return undefined;
  const anchor = Date.parse(task.completedAt ?? task.updatedAt);
  if (!Number.isFinite(anchor)) return undefined;
  const interval = Math.max(1, task.recurrenceInterval ?? 1);
  const day = 24 * 60 * 60 * 1000;
  const unit = task.recurrence === "daily" ? day : task.recurrence === "weekly" ? 7 * day : 30 * day;
  return new Date(anchor + interval * unit).toISOString();
}

export function isRecurringTaskDue(task: Pick<StoredDropTask, "recurrence" | "recurrenceInterval" | "completedAt" | "updatedAt">, now: string): boolean {
  const next = nextTaskRunAt(task);
  return next !== undefined && Date.parse(next) <= Date.parse(now);
}
