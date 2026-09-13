import type { DropTask } from "./task-model.js";

export type DropHunterContractTemplateId = "counter" | "erc20" | "erc721";

export interface DropHunterContractTemplate {
  id: DropHunterContractTemplateId;
  label: string;
  contractName: string;
  sourcePath: string;
  constructorArgs: readonly string[];
  recommendedFor: readonly string[];
  risk: "low" | "medium";
}

const TEMPLATES: readonly DropHunterContractTemplate[] = [
  {
    id: "counter",
    label: "Counter",
    contractName: "DropHunterCounter",
    sourcePath: "contracts/drop-hunter/templates/DropHunterCounter.sol",
    constructorArgs: [],
    recommendedFor: ["deploy contract", "developer activity", "builder task", "test contract"],
    risk: "low",
  },
  {
    id: "erc20",
    label: "ERC20",
    contractName: "DropHunterERC20",
    sourcePath: "contracts/drop-hunter/templates/DropHunterERC20.sol",
    constructorArgs: ["name", "symbol", "initialSupply"],
    recommendedFor: ["deploy erc20", "token contract", "fungible token", "developer activity"],
    risk: "medium",
  },
  {
    id: "erc721",
    label: "ERC721",
    contractName: "DropHunterERC721",
    sourcePath: "contracts/drop-hunter/templates/DropHunterERC721.sol",
    constructorArgs: ["name", "symbol"],
    recommendedFor: ["deploy nft", "erc721", "nft contract", "mint nft", "developer activity"],
    risk: "medium",
  },
] as const;

export class DropHunterContractTemplateCatalog {
  list(): DropHunterContractTemplate[] {
    return TEMPLATES.map((template) => ({ ...template, constructorArgs: [...template.constructorArgs], recommendedFor: [...template.recommendedFor] }));
  }

  get(id: DropHunterContractTemplateId): DropHunterContractTemplate {
    const template = TEMPLATES.find((item) => item.id === id);
    if (!template) throw new Error(`unknown Drop Hunter contract template: ${id}`);
    return { ...template, constructorArgs: [...template.constructorArgs], recommendedFor: [...template.recommendedFor] };
  }

  recommend(task: Pick<DropTask, "kind" | "title" | "description">): DropHunterContractTemplate | undefined {
    if (task.kind !== "deploy" && task.kind !== "mint") return undefined;
    const haystack = `${task.title} ${task.description}`.toLowerCase();
    if (/erc-?721|nft/.test(haystack)) return this.get("erc721");
    if (/erc-?20|token/.test(haystack)) return this.get("erc20");
    if (/contract|deploy|developer|builder/.test(haystack)) return this.get("counter");
    return undefined;
  }
}

export interface DropHunterContractDeploymentRequest {
  projectId: string;
  taskId: string;
  chainId: number;
  templateId: DropHunterContractTemplateId;
  constructorArgs: readonly unknown[];
  requiresUserApproval: true;
}

export function createDeploymentRequest(
  task: Pick<DropTask, "id" | "opportunityId" | "kind" | "title" | "description">,
  chainId: number,
  templateId?: DropHunterContractTemplateId,
  constructorArgs: readonly unknown[] = [],
): DropHunterContractDeploymentRequest {
  if (task.kind !== "deploy" && task.kind !== "mint") {
    throw new Error(`task ${task.id} is not a deploy-capable task`);
  }
  if (!Number.isInteger(chainId) || chainId <= 0) throw new Error(`invalid EVM chainId: ${chainId}`);
  const catalog = new DropHunterContractTemplateCatalog();
  const template = templateId ? catalog.get(templateId) : catalog.recommend(task);
  if (!template) throw new Error(`no contract template recommendation for task: ${task.id}`);
  if (constructorArgs.length !== template.constructorArgs.length) {
    throw new Error(`${template.contractName} expects ${template.constructorArgs.length} constructor argument(s)`);
  }
  return {
    projectId: task.opportunityId,
    taskId: task.id,
    chainId,
    templateId: template.id,
    constructorArgs: [...constructorArgs],
    requiresUserApproval: true,
  };
}
