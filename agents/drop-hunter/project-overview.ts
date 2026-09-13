import type { DropTaskAutomationPolicy } from "./automation-policy.js";
import { DropHunterAttentionQueue, type DropHunterAttentionItem } from "./attention-queue.js";
import type { DropHunterEvidenceRecord, DropHunterEvidenceStore } from "./evidence-history.js";
import type { DropHunterProductStore, DropHunterProjectRecord } from "./product-store.js";
import type { DropHunterRewardRecord } from "./reward-model.js";
import { DropHunterRewardService, type DropHunterRewardSummary } from "./reward-service.js";
import type { DropHunterRewardStore } from "./reward-store.js";
import { deriveLearningSignals, type DropHunterLearningSignals } from "./learning-signals.js";

export interface DropHunterProjectOverview {
  project: DropHunterProjectRecord;
  progress: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    percent: number;
  };
  evidence: DropHunterEvidenceRecord[];
  rewards: DropHunterRewardRecord[];
  rewardSummary: DropHunterRewardSummary;
  attention: DropHunterAttentionItem[];
  learning: DropHunterLearningSignals;
}

export class DropHunterProjectOverviewService {
  private readonly attention: DropHunterAttentionQueue;
  private readonly rewards: DropHunterRewardService;

  constructor(
    private readonly projects: DropHunterProductStore,
    private readonly evidence: DropHunterEvidenceStore,
    rewardStore: DropHunterRewardStore,
    policy: DropTaskAutomationPolicy,
  ) {
    this.attention = new DropHunterAttentionQueue(policy);
    this.rewards = new DropHunterRewardService(rewardStore);
  }

  async get(projectId: string): Promise<DropHunterProjectOverview | undefined> {
    const project = await this.projects.getProject(projectId);
    if (!project) return undefined;
    const [evidence, rewards, rewardSummary] = await Promise.all([
      this.evidence.listProject(projectId),
      this.rewards.list({ projectId }),
      this.rewards.summary(projectId),
    ]);
    const total = project.tasks.length;
    const completed = project.tasks.filter((task) => task.status === "completed").length;
    const failed = project.tasks.filter((task) => task.status === "failed").length;
    const skipped = project.tasks.filter((task) => task.status === "skipped").length;
    return {
      project,
      progress: {
        total,
        completed,
        failed,
        skipped,
        percent: total === 0 ? 0 : Math.round((completed / total) * 100),
      },
      evidence: evidence.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
      rewards,
      rewardSummary,
      attention: this.attention.build([project]),
      learning: deriveLearningSignals(evidence),
    };
  }
}
