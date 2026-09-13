import type { DropHunterEvidenceRecord } from "./evidence-history.js";
import type { DropHunterRewardRecord } from "./reward-model.js";
import type { DropHunterRewardService } from "./reward-service.js";

export interface RewardEvidenceBridgeOptions {
  defaultConfidence?: number;
}

export class DropHunterRewardEvidenceBridge {
  private readonly defaultConfidence: number;

  constructor(
    private readonly rewards: DropHunterRewardService,
    options: RewardEvidenceBridgeOptions = {},
  ) {
    this.defaultConfidence = options.defaultConfidence ?? 0.8;
    if (!Number.isFinite(this.defaultConfidence) || this.defaultConfidence < 0 || this.defaultConfidence > 1) {
      throw new Error("defaultConfidence must be between 0 and 1");
    }
  }

  async ingest(record: DropHunterEvidenceRecord): Promise<DropHunterRewardRecord | undefined> {
    if (record.rewardOutcome !== "rewarded") return undefined;
    const metadata = record.metadata ?? {};
    return this.rewards.detect({
      projectId: record.projectId,
      taskId: record.taskId,
      chainId: record.chainId,
      status: "detected",
      source: record.transactionHash ? "onchain" : "campaign",
      assetSymbol: text(metadata.rewardSymbol),
      assetAddress: text(metadata.rewardAssetAddress),
      amount: text(metadata.rewardAmount),
      estimatedUsd: number(metadata.rewardEstimatedUsd),
      confidence: number(metadata.rewardConfidence) ?? this.defaultConfidence,
      reference: record.transactionHash ?? record.reference ?? record.id,
      note: record.note,
      detectedAt: record.timestamp,
    });
  }

  async ingestMany(records: readonly DropHunterEvidenceRecord[]): Promise<DropHunterRewardRecord[]> {
    const results: DropHunterRewardRecord[] = [];
    for (const record of records) {
      const reward = await this.ingest(record);
      if (reward) results.push(reward);
    }
    return results;
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
