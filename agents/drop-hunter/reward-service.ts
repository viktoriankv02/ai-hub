import type { CreateRewardRecordInput, DropHunterRewardRecord, DropHunterRewardStatus } from "./reward-model.js";
import type { DropHunterRewardStore } from "./reward-store.js";
import { DropHunterRewardRepository } from "./reward-store.js";

export interface DropHunterRewardSummary {
  total: number;
  detected: number;
  claimable: number;
  claimed: number;
  confirmed: number;
  dismissed: number;
  estimatedUsd: number;
  confirmedUsd: number;
}

export class DropHunterRewardService {
  private readonly repository: DropHunterRewardRepository;

  constructor(
    private readonly store: DropHunterRewardStore,
    now: () => Date = () => new Date(),
  ) {
    this.repository = new DropHunterRewardRepository(store, now);
  }

  async list(filters: { projectId?: string; status?: DropHunterRewardStatus } = {}): Promise<DropHunterRewardRecord[]> {
    let rewards = await this.store.list();
    if (filters.projectId) rewards = rewards.filter((reward) => reward.projectId === filters.projectId);
    if (filters.status) rewards = rewards.filter((reward) => reward.status === filters.status);
    return rewards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }

  async get(id: string): Promise<DropHunterRewardRecord | undefined> {
    return this.store.get(id);
  }

  async detect(input: CreateRewardRecordInput): Promise<DropHunterRewardRecord> {
    return this.repository.upsert(input);
  }

  async setStatus(id: string, status: DropHunterRewardStatus, note?: string): Promise<DropHunterRewardRecord> {
    const current = await this.store.get(id);
    if (!current) throw new Error(`drop hunter reward not found: ${id}`);
    validateTransition(current.status, status);
    return this.repository.setStatus(id, status, note);
  }

  async summary(projectId?: string): Promise<DropHunterRewardSummary> {
    const rewards = await this.list(projectId ? { projectId } : {});
    const count = (status: DropHunterRewardStatus) => rewards.filter((reward) => reward.status === status).length;
    const estimatedUsd = rewards.reduce((sum, reward) => sum + (reward.estimatedUsd ?? 0), 0);
    const confirmedUsd = rewards
      .filter((reward) => reward.status === "confirmed")
      .reduce((sum, reward) => sum + (reward.estimatedUsd ?? 0), 0);
    return {
      total: rewards.length,
      detected: count("detected"),
      claimable: count("claimable"),
      claimed: count("claimed"),
      confirmed: count("confirmed"),
      dismissed: count("dismissed"),
      estimatedUsd: roundMoney(estimatedUsd),
      confirmedUsd: roundMoney(confirmedUsd),
    };
  }
}

function validateTransition(from: DropHunterRewardStatus, to: DropHunterRewardStatus): void {
  if (from === to) return;
  const allowed: Record<DropHunterRewardStatus, readonly DropHunterRewardStatus[]> = {
    detected: ["claimable", "confirmed", "dismissed"],
    claimable: ["claimed", "confirmed", "dismissed"],
    claimed: ["confirmed", "dismissed"],
    confirmed: [],
    dismissed: ["detected", "claimable"],
  };
  if (!allowed[from].includes(to)) throw new Error(`invalid reward status transition: ${from} -> ${to}`);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
