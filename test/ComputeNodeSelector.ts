import { expect } from "chai";
import { rankComputeNodes, selectComputeNode } from "../agents/ai-jobs/compute-node-selector.js";

describe("ComputeNodeSelector", function () {
  const request = {
    region: "eu-central",
    minGpuMemory: 24,
    minCpuCores: 16,
    minRam: 64,
    preferredGpuModels: ["RTX 5090"],
    maxHeartbeatAgeSeconds: 60,
  };

  it("prefers a fresh, reliable, matching GPU node", function () {
    const nodes = rankComputeNodes([
      {
        id: "node-a",
        gpuModel: "A100",
        gpuMemory: 40,
        cpuCores: 32,
        ram: 128,
        region: "us-east",
        reputation: 100,
        completedJobs: 50,
        failedJobs: 1,
        lastHeartbeat: 1_000,
        activeJobs: 1,
        online: true,
      },
      {
        id: "node-b",
        gpuModel: "RTX 5090",
        gpuMemory: 32,
        cpuCores: 16,
        ram: 64,
        region: "eu-central",
        reputation: 100,
        completedJobs: 40,
        failedJobs: 1,
        lastHeartbeat: 1_990,
        activeJobs: 0,
        online: true,
      },
    ], request, 2_000);

    expect(nodes[0].id).to.equal("node-b");
    expect(nodes[0].reasons).to.include("preferred GPU model");
    expect(nodes[0].reasons).to.include("fresh heartbeat");
  });

  it("filters offline and saturated nodes", function () {
    const selected = selectComputeNode([
      { id: "offline", online: false, reputation: 999 },
      { id: "busy", online: true, activeJobs: 2, maxActiveJobs: 2, reputation: 999 },
      { id: "ready", online: true, activeJobs: 0, reputation: 50 },
    ]);

    expect(selected?.id).to.equal("ready");
  });

  it("uses deterministic id ordering when scores tie", function () {
    const nodes = rankComputeNodes([
      { id: "node-z", online: true, reputation: 100 },
      { id: "node-a", online: true, reputation: 100 },
    ]);

    expect(nodes.map((node) => node.id)).to.deep.equal(["node-a", "node-z"]);
  });
});
