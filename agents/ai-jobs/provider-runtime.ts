import { createHash } from "node:crypto";
import type { AIJobExecutionContext, AIJobExecutor } from "./executor.js";
import { AIProviderJobExecutor } from "./executor.js";
import type { AIJobRecord } from "./types.js";

export interface AIProviderDescriptor {
  id: string;
  version: string;
  capabilities: string[];
  enabled: boolean;
}

export interface AIProvider extends AIProviderExecutionContext {
  descriptor: AIProviderDescriptor;
}

export interface AIProviderExecutionContext extends AIJobExecutionContext {}

export interface ProviderExecutionRecord {
  jobId: string;
  providerId: string;
  providerVersion: string;
  startedAt: string;
  finishedAt: string;
  resultHash: string;
  output?: string;
}

export class AIProviderRuntime {
  private readonly providers = new Map<string, AIProvider>();
  private readonly executions = new Map<string, ProviderExecutionRecord>();

  register(provider: AIProvider): void {
    const id = provider.descriptor.id.trim();
    if (!id) throw new Error("provider id is required");
    if (!provider.descriptor.version.trim()) throw new Error("provider version is required");
    if (this.providers.has(id)) throw new Error(`provider already registered: ${id}`);
    this.providers.set(id, provider);
  }

  setEnabled(providerId: string, enabled: boolean): void {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`provider not found: ${providerId}`);
    provider.descriptor.enabled = enabled;
  }

  get(providerId: string): AIProvider | undefined {
    return this.providers.get(providerId);
  }

  list(): AIProviderDescriptor[] {
    return [...this.providers.values()].map((provider) => ({
      ...provider.descriptor,
      capabilities: [...provider.descriptor.capabilities],
    }));
  }

  async execute(
    providerId: string,
    job: AIJobRecord,
    now: () => Date = () => new Date(),
  ): Promise<ProviderExecutionRecord> {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`provider not found: ${providerId}`);
    if (!provider.descriptor.enabled) throw new Error(`provider disabled: ${providerId}`);

    const existing = this.executions.get(job.id);
    if (existing) return { ...existing };

    const started = now().toISOString();
    const executor: AIJobExecutor = new AIProviderJobExecutor(provider);
    const result = await executor.execute(job);
    const finished = now().toISOString();

    const record: ProviderExecutionRecord = {
      jobId: job.id,
      providerId,
      providerVersion: provider.descriptor.version,
      startedAt: started,
      finishedAt: finished,
      resultHash: result.resultHash,
      output: result.output,
    };

    this.executions.set(job.id, record);
    return { ...record };
  }

  execution(jobId: string): ProviderExecutionRecord | undefined {
    const record = this.executions.get(jobId);
    return record ? { ...record } : undefined;
  }

  executionFingerprint(jobId: string): string | undefined {
    const record = this.executions.get(jobId);
    if (!record) return undefined;
    return createHash("sha256")
      .update(
        [
          record.jobId,
          record.providerId,
          record.providerVersion,
          record.startedAt,
          record.finishedAt,
          record.resultHash,
        ].join("\n"),
        "utf8",
      )
      .digest("hex");
  }
}
