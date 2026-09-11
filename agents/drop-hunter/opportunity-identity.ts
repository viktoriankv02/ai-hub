import type { ProjectOpportunity } from "./types.js";

export function normalizeProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(testnet|mainnet|network|chain|protocol|labs?|foundation)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

export function canonicalOpportunityKey(opportunity: Pick<ProjectOpportunity, "id" | "name" | "chainId" | "vm">): string {
  const name = normalizeProjectName(opportunity.name);
  if (opportunity.chainId !== undefined) return `${opportunity.vm.toLowerCase()}:${opportunity.chainId}:${name}`;
  if (name) return `${opportunity.vm.toLowerCase()}:name:${name}`;
  return `${opportunity.vm.toLowerCase()}:id:${opportunity.id.toLowerCase()}`;
}

export function sameOpportunity(left: ProjectOpportunity, right: ProjectOpportunity): boolean {
  if (left.id === right.id) return true;
  if (left.chainId !== undefined && right.chainId !== undefined && left.chainId !== right.chainId) return false;
  return canonicalOpportunityKey(left) === canonicalOpportunityKey(right);
}
