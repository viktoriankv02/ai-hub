import type { AIJobCompletionReceipt } from "./completion-receipt.js";
import type { AIJobRecord } from "./types.js";

export interface AIJobReceiptSubmission {
  transactionId: string;
  receipt: AIJobCompletionReceipt;
}

export interface AIJobReceiptSink {
  submit(job: AIJobRecord, receipt: AIJobCompletionReceipt): Promise<AIJobReceiptSubmission>;
}

export class InMemoryAIJobReceiptSink implements AIJobReceiptSink {
  private readonly submissions = new Map<string, AIJobReceiptSubmission>();

  async submit(job: AIJobRecord, receipt: AIJobCompletionReceipt): Promise<AIJobReceiptSubmission> {
    const existing = this.submissions.get(job.id);
    if (existing) return existing;

    const submission = {
      transactionId: `receipt_${receipt.receiptHash.replace(/^sha256:/, "")}`,
      receipt,
    };
    this.submissions.set(job.id, submission);
    return submission;
  }

  get(jobId: string): AIJobReceiptSubmission | undefined {
    return this.submissions.get(jobId);
  }

  list(): AIJobReceiptSubmission[] {
    return [...this.submissions.values()];
  }
}
