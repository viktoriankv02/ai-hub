export interface ComputeNodeCandidate {
  id: string;
  gpuModel?: string;
  gpuMemory?: number;
  cpuCores?: number;
  ram?: number;
  region?: string;
  reputation?: number;
  completedJobs?: number;
  failedJobs?: number;
  lastHeartbeat?: number;
  activeJobs?: number;
  maxActiveJobs?: number;
  online?: boolean;
}

export interface ComputeNodeSelectionRequest {
  region?: string;
  minGpuMemory?: number;
  minCpuCores?: number;
  minRam?: number;
  preferredGpuModels?: string[];
  maxHeartbeatAgeSeconds?: number;
}

export interface RankedComputeNode extends ComputeNodeCandidate {
  score: number;
  reasons: string[];
}

function normalized(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function lower(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function availability(node: ComputeNodeCandidate): boolean {
  if (node.online === false) return false;
  if (node.maxActiveJobs !== undefined && normalized(node.activeJobs) >= node.maxActiveJobs) return false;
  return true;
}

export function scoreComputeNode(
  node: ComputeNodeCandidate,
  request: ComputeNodeSelectionRequest = {},
  nowSeconds = Math.floor(Date.now() / 1000),
): RankedComputeNode | undefined {
  if (!node.id.trim() || !availability(node)) return undefined;

  const reasons: string[] = [];
  let score = 0;

  if (request.region && lower(node.region) === lower(request.region)) {
    score += 20;
    reasons.push("preferred region");
  }
  if (request.minGpuMemory !== undefined && normalized(node.gpuMemory) >= request.minGpuMemory) {
    score += 15;
    reasons.push("sufficient GPU memory");
  }
  if (request.minCpuCores !== undefined && normalized(node.cpuCores) >= request.minCpuCores) {
    score += 10;
    reasons.push("sufficient CPU capacity");
  }
  if (request.minRam !== undefined && normalized(node.ram) >= request.minRam) {
    score += 10;
    reasons.push("sufficient RAM");
  }

  const preferredModels = (request.preferredGpuModels ?? []).map(lower).filter(Boolean);
  if (preferredModels.length > 0 && preferredModels.includes(lower(node.gpuModel))) {
    score += 20;
    reasons.push("preferred GPU model");
  }

  const reputation = Math.min(20, Math.round(normalized(node.reputation) / 5));
  if (reputation > 0) {
    score += reputation;
    reasons.push("reputation");
  }

  const completed = normalized(node.completedJobs);
  const failed = normalized(node.failedJobs);
  const total = completed + failed;
  if (total > 0) {
    const successRate = completed / total;
    const reliability = Math.round(successRate * 15);
    score += reliability;
    if (reliability >= 12) reasons.push("high completion reliability");
  }

  if (node.lastHeartbeat !== undefined && request.maxHeartbeatAgeSeconds !== undefined) {
    const age = Math.max(0, nowSeconds - node.lastHeartbeat);
    if (age <= request.maxHeartbeatAgeSeconds) {
      score += 10;
      reasons.push("fresh heartbeat");
    }
  }

  const activeJobs = normalized(node.activeJobs);
  if (activeJobs === 0) {
    score += 5;
    reasons.push("idle node");
  }

  return { ...node, score, reasons };
}

export function rankComputeNodes(
  nodes: ComputeNodeCandidate[],
  request: ComputeNodeSelectionRequest = {},
  nowSeconds = Math.floor(Date.now() / 1000),
): RankedComputeNode[] {
  return nodes
    .map((node) => scoreComputeNode(node, request, nowSeconds))
    .filter((node): node is RankedComputeNode => Boolean(node))
    .sort((a, b) => b.score - a.score || normalized(b.reputation) - normalized(a.reputation) || a.id.localeCompare(b.id));
}

export function selectComputeNode(
  nodes: ComputeNodeCandidate[],
  request: ComputeNodeSelectionRequest = {},
  nowSeconds = Math.floor(Date.now() / 1000),
): RankedComputeNode | undefined {
  return rankComputeNodes(nodes, request, nowSeconds)[0];
}
