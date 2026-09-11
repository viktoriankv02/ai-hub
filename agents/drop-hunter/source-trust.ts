export type OpportunitySourceClass = "official" | "repository" | "ecosystem" | "campaign" | "community" | "unknown";

export interface OpportunitySourceAssessment {
  source: string;
  sourceClass: OpportunitySourceClass;
  trust: number;
  reasons: string[];
}

export function assessOpportunitySource(source: string): OpportunitySourceAssessment {
  const value = source.trim();
  const lower = value.toLowerCase();
  const reasons: string[] = [];
  let sourceClass: OpportunitySourceClass = "unknown";
  let trust = 35;

  if (/docs\.|documentation|official/.test(lower)) {
    sourceClass = "official";
    trust = 90;
    reasons.push("official documentation signal");
  } else if (/github\.com/.test(lower)) {
    sourceClass = "repository";
    trust = 80;
    reasons.push("public source-code repository");
  } else if (/foundation|ecosystem|developer|builders?/.test(lower)) {
    sourceClass = "ecosystem";
    trust = 75;
    reasons.push("ecosystem or developer-program source");
  } else if (/galxe|layer3|zealy|quest/.test(lower)) {
    sourceClass = "campaign";
    trust = 65;
    reasons.push("campaign platform source");
  } else if (/discord|telegram|reddit|twitter|x\.com/.test(lower)) {
    sourceClass = "community";
    trust = 45;
    reasons.push("community source requires corroboration");
  } else {
    reasons.push("unclassified source");
  }

  return { source: value, sourceClass, trust, reasons };
}

export function aggregateSourceTrust(sources: readonly string[]): { trust: number; assessments: OpportunitySourceAssessment[] } {
  const assessments = [...new Set(sources.map((source) => source.trim()).filter(Boolean))].map(assessOpportunitySource);
  if (assessments.length === 0) return { trust: 0, assessments: [] };
  const sorted = assessments.map((item) => item.trust).sort((a, b) => b - a);
  const best = sorted[0];
  const corroboration = Math.min(15, Math.max(0, sorted.length - 1) * 5);
  const secondary = sorted.slice(1, 3).reduce((sum, value) => sum + value * 0.05, 0);
  return { trust: Math.min(100, Math.round(best + corroboration + secondary)), assessments };
}
