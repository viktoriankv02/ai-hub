import type {
  DropHunterAgentTaskExecutionContext,
  DropHunterAgentTaskExecutionResult,
  DropHunterAgentTaskExecutor,
} from "./agent-task-runner.js";

export interface HttpCheckInTarget {
  projectId: string;
  url: string;
  method?: "GET" | "POST";
  successStatus?: number;
  successText?: string;
}

export interface HttpCheckInResponse {
  status: number;
  text(): Promise<string>;
}

export type HttpCheckInFetcher = (
  url: string,
  init: { method: "GET" | "POST"; redirect: "error"; signal: AbortSignal },
) => Promise<HttpCheckInResponse>;

export interface HttpCheckInExecutorOptions {
  targets: readonly HttpCheckInTarget[];
  timeoutMs?: number;
  fetcher?: HttpCheckInFetcher;
}

export class HttpCheckInExecutor implements DropHunterAgentTaskExecutor {
  readonly kinds = ["check-in"] as const;
  private readonly targets = new Map<string, Required<Omit<HttpCheckInTarget, "successText">> & Pick<HttpCheckInTarget, "successText">>();
  private readonly timeoutMs: number;
  private readonly fetcher: HttpCheckInFetcher;

  constructor(options: HttpCheckInExecutorOptions) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 500 || this.timeoutMs > 60_000) {
      throw new Error("check-in timeoutMs must be between 500 and 60000");
    }
    this.fetcher = options.fetcher ?? ((url, init) => fetch(url, init));

    for (const target of options.targets) {
      if (!target.projectId.trim()) throw new Error("check-in target requires projectId");
      const parsed = new URL(target.url);
      if (parsed.protocol !== "https:") throw new Error(`check-in target must use HTTPS: ${target.url}`);
      if (parsed.username || parsed.password) throw new Error("check-in target URL cannot contain credentials");
      if (this.targets.has(target.projectId)) throw new Error(`duplicate check-in target: ${target.projectId}`);
      this.targets.set(target.projectId, {
        projectId: target.projectId,
        url: parsed.toString(),
        method: target.method ?? "GET",
        successStatus: target.successStatus ?? 200,
        successText: target.successText,
      });
    }
  }

  async execute(context: DropHunterAgentTaskExecutionContext): Promise<DropHunterAgentTaskExecutionResult> {
    const target = this.targets.get(context.projectId);
    if (!target) {
      return { status: "skipped", note: `no trusted check-in target configured for ${context.projectName}` };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(target.url, {
        method: target.method,
        redirect: "error",
        signal: controller.signal,
      });
      if (response.status !== target.successStatus) {
        return { status: "failed", note: `check-in returned HTTP ${response.status}; expected ${target.successStatus}` };
      }
      if (target.successText) {
        const body = await response.text();
        if (!body.includes(target.successText)) {
          return { status: "failed", note: "check-in response did not contain the configured success marker" };
        }
      }
      return { status: "completed", note: `trusted off-chain check-in completed for ${context.projectName}` };
    } catch (error) {
      if (controller.signal.aborted) return { status: "failed", note: `check-in timed out after ${this.timeoutMs}ms` };
      return { status: "failed", note: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function parseHttpCheckInTargetsJson(value: string | undefined): HttpCheckInTarget[] {
  if (!value?.trim()) return [];
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error("DROP_HUNTER_CHECKIN_TARGETS_JSON must be a JSON array");
  return parsed.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`invalid check-in target at index ${index}`);
    const record = item as Record<string, unknown>;
    if (typeof record.projectId !== "string" || typeof record.url !== "string") throw new Error(`check-in target ${index} requires projectId and url`);
    const method = record.method === undefined ? undefined : record.method;
    if (method !== undefined && method !== "GET" && method !== "POST") throw new Error(`invalid check-in method at index ${index}`);
    const successStatus = record.successStatus === undefined ? undefined : Number(record.successStatus);
    if (successStatus !== undefined && (!Number.isInteger(successStatus) || successStatus < 100 || successStatus > 599)) throw new Error(`invalid successStatus at index ${index}`);
    return {
      projectId: record.projectId,
      url: record.url,
      method,
      successStatus,
      successText: typeof record.successText === "string" ? record.successText : undefined,
    };
  });
}
