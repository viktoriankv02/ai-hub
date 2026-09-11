import { chains, type ChainConfig } from "../../config/chains.js";
import {
  DropHunterContractTemplateCatalog,
  createDeploymentRequest,
  type DropHunterContractDeploymentRequest,
  type DropHunterContractTemplate,
  type DropHunterContractTemplateId,
} from "./contract-template-catalog.js";
import type { DropHunterProjectRecord, StoredDropTask } from "./product-store.js";

export interface ContractDeploymentPlan {
  request: DropHunterContractDeploymentRequest;
  chain: ChainConfig;
  template: DropHunterContractTemplate;
  sourcePath: string;
  contractName: string;
  constructorArgs: readonly unknown[];
  rpcEnv: string;
  explorerUrl?: string;
  warnings: string[];
  executable: boolean;
  blockers: string[];
}

export interface ContractDeploymentPlanOptions {
  templateId?: DropHunterContractTemplateId;
  constructorArgs?: readonly unknown[];
  env?: NodeJS.ProcessEnv;
}

export class DropHunterContractDeploymentEngine {
  constructor(
    private readonly catalog = new DropHunterContractTemplateCatalog(),
    private readonly chainRegistry: readonly ChainConfig[] = chains,
  ) {}

  plan(project: DropHunterProjectRecord, task: StoredDropTask, options: ContractDeploymentPlanOptions = {}): ContractDeploymentPlan {
    if (task.opportunityId !== project.id) throw new Error(`task ${task.id} does not belong to project ${project.id}`);
    if (task.status !== "ready") throw new Error(`deploy task must be explicitly approved and ready: ${task.id}`);
    if (task.kind !== "deploy" && task.kind !== "mint") throw new Error(`task ${task.id} is not deploy-capable`);

    const chainId = project.opportunity.chainId;
    if (!Number.isInteger(chainId) || !chainId || chainId <= 0) throw new Error(`project ${project.id} does not have a valid EVM chainId`);
    const chain = this.chainRegistry.find((item) => item.chainId === chainId);
    if (!chain) throw new Error(`chain ${chainId} is not registered in AI Hub`);
    if (chain.kind !== "evm") throw new Error(`chain ${chain.name} is not EVM-compatible`);

    const template = options.templateId ? this.catalog.get(options.templateId) : this.catalog.recommend(task);
    if (!template) throw new Error(`no deployment template is available for task ${task.id}`);
    const constructorArgs = options.constructorArgs ?? this.defaultConstructorArgs(project, template);
    const request = createDeploymentRequest(task, chainId, template.id, constructorArgs);
    const blockers: string[] = [];
    const env = options.env ?? process.env;

    if (!chain.enabled) blockers.push(`chain-disabled:${chain.key}`);
    if (!chain.rpcEnv) blockers.push(`rpc-env-not-configured:${chain.key}`);
    else if (!env[chain.rpcEnv]?.trim()) blockers.push(`rpc-missing:${chain.rpcEnv}`);

    const warnings = [
      "Deployment requires explicit user approval before signing.",
      "The planner never reads or stores a private key.",
      `Template source is fixed to ${template.sourcePath}.`,
    ];
    if (chain.notes) warnings.push(chain.notes);

    return {
      request,
      chain: { ...chain },
      template,
      sourcePath: template.sourcePath,
      contractName: template.contractName,
      constructorArgs: [...constructorArgs],
      rpcEnv: chain.rpcEnv ?? "",
      explorerUrl: chain.explorerUrl,
      warnings,
      executable: blockers.length === 0,
      blockers,
    };
  }

  private defaultConstructorArgs(project: DropHunterProjectRecord, template: DropHunterContractTemplate): readonly unknown[] {
    const projectName = project.opportunity.name.replace(/[^a-zA-Z0-9 ]/g, "").trim() || "Drop Hunter";
    const symbolBase = projectName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6) || "DROP";
    if (template.id === "counter") return [];
    if (template.id === "erc20") return [`${projectName} Builder Token`, `${symbolBase}B`, "1000000000000000000000"];
    if (template.id === "erc721") return [`${projectName} Builder NFT`, `${symbolBase}N`];
    return [];
  }
}
