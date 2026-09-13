import { createHash } from "node:crypto";
import { ContractFactory } from "ethers";
import type { ContractDeploymentPlan } from "./contract-deployment-engine.js";
import type { ContractArtifactLoader } from "./contract-artifact-loader.js";

export interface ContractDeploymentPreview {
  projectId: string;
  taskId: string;
  chainId: number;
  contractName: string;
  templateId: string;
  constructorArgs: readonly unknown[];
  data: string;
  value: string;
  requiresUserApproval: true;
  warnings: string[];
  previewHash: string;
}

export class ContractDeploymentPreviewBuilder {
  constructor(private readonly artifacts: ContractArtifactLoader) {}

  async build(plan: ContractDeploymentPlan): Promise<ContractDeploymentPreview> {
    if (!plan.executable) throw new Error(`deployment plan is blocked: ${plan.blockers.join(", ")}`);
    const artifact = await this.artifacts.load(plan);
    const factory = new ContractFactory(artifact.abi, artifact.bytecode);
    const transaction = await factory.getDeployTransaction(...plan.constructorArgs);
    if (typeof transaction.data !== "string" || !/^0x[0-9a-fA-F]+$/.test(transaction.data)) {
      throw new Error(`deployment transaction data is invalid for ${plan.contractName}`);
    }
    const base = {
      projectId: plan.request.projectId,
      taskId: plan.request.taskId,
      chainId: plan.request.chainId,
      contractName: plan.contractName,
      templateId: plan.template.id,
      constructorArgs: [...plan.constructorArgs],
      data: transaction.data,
      value: transaction.value === undefined ? "0" : transaction.value.toString(),
      requiresUserApproval: true as const,
      warnings: [...plan.warnings, "Contract creation transaction is prepared for wallet approval."],
    };
    return { ...base, previewHash: deploymentPreviewHash(base) };
  }
}

export function deploymentPreviewHash(value: Omit<ContractDeploymentPreview, "previewHash"> | ContractDeploymentPreview): string {
  return `deploy-preview:${createHash("sha256").update(JSON.stringify(canonicalize(value)), "utf8").digest("hex")}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key, entry]) => key !== "previewHash" && entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}
