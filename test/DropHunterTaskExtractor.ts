import { expect } from "chai";
import { extractDropTasks } from "../agents/drop-hunter/task-extractor.js";
import type { ProjectOpportunity } from "../agents/drop-hunter/types.js";

describe("Drop Hunter task extractor", function () {
  const opportunity: ProjectOpportunity = {
    id: "base-sepolia",
    name: "Base Sepolia",
    chainId: 84532,
    vm: "EVM",
    stage: "testnet",
    priority: 90,
    signals: {},
    sources: ["config/chainCatalog.ts"],
    actions: ["deploy core", "register chain", "record verified activity", "test reward flow"],
  };

  it("classifies core platform actions without extraction warnings", function () {
    const result = extractDropTasks(opportunity);
    expect(result.warnings).to.deep.equal([]);
    expect(result.tasks.map((task) => task.kind)).to.deep.equal(["deploy", "other", "other", "other"]);
    expect(result.tasks.map((task) => task.risk)).to.deep.equal(["medium", "low", "low", "high"]);
  });

  it("keeps wallet approval boundaries explicit", function () {
    const result = extractDropTasks(opportunity);
    expect(result.tasks[0].requiresWallet).to.equal(true);
    expect(result.tasks[0].requiresUserApproval).to.equal(true);
    expect(result.tasks[1].requiresWallet).to.equal(true);
    expect(result.tasks[1].requiresUserApproval).to.equal(true);
    expect(result.tasks[3].risk).to.equal("high");
    expect(result.tasks[3].requiresUserApproval).to.equal(true);
  });

  it("recognizes recurring check-ins, faucets and contract interactions", function () {
    const result = extractDropTasks({
      ...opportunity,
      id: "automation-project",
      actions: ["Daily check-in", "Use faucet", "Interact with contract"],
    });

    expect(result.warnings).to.deep.equal([]);
    expect(result.tasks.map((task) => task.kind)).to.deep.equal(["check-in", "faucet", "contract-call"]);
    expect(result.tasks[0].recurrence).to.equal("daily");
    expect(result.tasks[0].automated).to.equal(true);
    expect(result.tasks[0].requiresUserApproval).to.equal(false);
    expect(result.tasks[2].requiresWallet).to.equal(true);
    expect(result.tasks[2].requiresUserApproval).to.equal(true);
  });
});
