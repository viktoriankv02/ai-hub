import { expect } from "chai";
import {
  DropHunterContractTemplateCatalog,
  createDeploymentRequest,
} from "../agents/drop-hunter/index.js";
import type { DropTask } from "../agents/drop-hunter/task-model.js";

const task = (overrides: Partial<DropTask> = {}): DropTask => ({
  id: "deploy-task",
  opportunityId: "project-1",
  title: "Deploy contract",
  description: "Deploy a developer contract",
  kind: "deploy",
  risk: "medium",
  automated: true,
  requiresWallet: true,
  requiresGas: true,
  requiresUserApproval: true,
  prerequisites: [],
  evidenceRequired: ["transaction hash"],
  source: "docs",
  ...overrides,
});

describe("DropHunterContractTemplateCatalog", () => {
  it("recommends ERC20 for token deployment tasks", () => {
    const catalog = new DropHunterContractTemplateCatalog();
    expect(catalog.recommend(task({ title: "Deploy ERC20 token" }))?.id).to.equal("erc20");
  });

  it("recommends ERC721 for NFT deployment tasks", () => {
    const catalog = new DropHunterContractTemplateCatalog();
    expect(catalog.recommend(task({ title: "Deploy NFT contract" }))?.id).to.equal("erc721");
  });

  it("falls back to the counter template for generic developer deployment", () => {
    const catalog = new DropHunterContractTemplateCatalog();
    expect(catalog.recommend(task())?.id).to.equal("counter");
  });

  it("creates an approval-gated deployment request", () => {
    const request = createDeploymentRequest(task({ title: "Deploy ERC20 token" }), 84532, "erc20", ["Test Token", "TEST", 1000n]);
    expect(request.chainId).to.equal(84532);
    expect(request.templateId).to.equal("erc20");
    expect(request.requiresUserApproval).to.equal(true);
  });

  it("rejects wrong constructor argument counts", () => {
    expect(() => createDeploymentRequest(task({ title: "Deploy ERC20 token" }), 84532, "erc20", [])).to.throw(
      "DropHunterERC20 expects 3 constructor argument(s)",
    );
  });
});
