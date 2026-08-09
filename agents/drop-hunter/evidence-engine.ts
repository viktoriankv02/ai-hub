import type { ExecutionStatus } from "./execution-memory.js";

export type EvidenceKind =
  | "onchain"
  | "github"
  | "deployment"
  | "verification"
  | "participation"
  | "reward";

export type EvidenceConfidence = "low" | "medium" | "high";

export interface ActionEvidence {
  actionId: string;
  kind: EvidenceKind;
  status: ExecutionStatus;
  confidence: EvidenceConfidence;
  timestamp: string;
  chainId?: number;
  txHash?: string;
  contractAddress?: string;
  url?: string;
  note?: string;
}

export interface EvidenceSummary {
  actionId: string;
  verified: boolean;
  confidence: EvidenceConfidence;
  evidenceCount: number;
  kinds: EvidenceKind[];
  txHashes: string[];
}

const confidenceRank: Record<EvidenceConfidence, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

function highestConfidence(values: EvidenceConfidence[]): EvidenceConfidence {
  if (values.length === 0) return "low";
  return values.reduce((best, value) =>
    confidenceRank[value] > confidenceRank[best] ? value : best,
  );
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Evidence is deliberately separate from execution memory. An action can
 * succeed locally while still lacking enough proof to count as verified.
 */
export function summarizeEvidence(
  actionId: string,
  evidence: ActionEvidence[],
): EvidenceSummary {
  const relevant = evidence.filter((item) => item.actionId === actionId);
  const successful = relevant.filter((item) => item.status === "success");
  const verified = successful.some(
    (item) => item.kind === "onchain" || item.kind === "deployment" || item.kind === "verification",
  );

  return {
    actionId,
    verified,
    confidence: highestConfidence(relevant.map((item) => item.confidence)),
    evidenceCount: relevant.length,
    kinds: unique(relevant.map((item) => item.kind)),
    txHashes: unique(
      relevant
        .map((item) => item.txHash)
        .filter((hash): hash is string => Boolean(hash)),
    ),
  };
}

/**
 * Returns only evidence that can be safely treated as proof of a completed
 * developer action. Failed/skipped observations are retained in storage but
 * excluded from the verified set.
 */
export function verifiedEvidence(evidence: ActionEvidence[]): ActionEvidence[] {
  return evidence.filter(
    (item) =>
      item.status === "success" &&
      (item.kind === "onchain" || item.kind === "deployment" || item.kind === "verification"),
  );
}

/**
 * Adds an evidence record without mutating the existing evidence history.
 */
export function recordEvidence(
  evidence: ActionEvidence[],
  item: ActionEvidence,
): ActionEvidence[] {
  return [...evidence, { ...item }];
}
