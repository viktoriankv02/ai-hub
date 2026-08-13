import type { AIJobRecord, AIJobStatus } from "./types.js";

export type AIJobAuditAction = "created" | "started" | "completed" | "failed" | "cancelled" | "retry";

export interface AIJobAuditEvent {
  id: string;
  jobId: string;
  action: AIJobAuditAction;
  fromStatus?: AIJobStatus;
  toStatus: AIJobStatus;
  attempts: number;
  timestamp: string;
  error?: string;
  resultHash?: string;
}

export interface AIJobAuditLog {
  append(event: AIJobAuditEvent): void;
  list(jobId?: string): AIJobAuditEvent[];
}

export class InMemoryAIJobAuditLog implements AIJobAuditLog {
  private readonly events: AIJobAuditEvent[] = [];

  append(event: AIJobAuditEvent): void {
    if (this.events.some((item) => item.id === event.id)) return;
    this.events.push({ ...event });
  }

  list(jobId?: string): AIJobAuditEvent[] {
    return this.events
      .filter((event) => !jobId || event.jobId === jobId)
      .map((event) => ({ ...event }));
  }
}

export function auditFromTransition(
  previous: AIJobRecord | undefined,
  next: AIJobRecord,
  id: string,
  action: AIJobAuditAction,
  now: string,
): AIJobAuditEvent {
  return {
    id,
    jobId: next.id,
    action,
    fromStatus: previous?.status,
    toStatus: next.status,
    attempts: next.attempts,
    timestamp: now,
    error: next.error,
    resultHash: next.resultHash,
  };
}
