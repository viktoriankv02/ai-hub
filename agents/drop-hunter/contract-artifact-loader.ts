import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ContractDeploymentPlan } from "./contract-deployment-engine.js";

export interface ContractBuildArtifact {
  contractName: string;
  abi: readonly unknown[];
  bytecode: string;
}

export interface ContractArtifactLoader {
  load(plan: ContractDeploymentPlan): Promise<ContractBuildArtifact>;
}

export class HardhatJsonArtifactLoader implements ContractArtifactLoader {
  constructor(private readonly projectRoot = process.cwd()) {}

  async load(plan: ContractDeploymentPlan): Promise<ContractBuildArtifact> {
    const artifactPath = resolve(this.projectRoot, "artifacts", plan.sourcePath, `${plan.contractName}.json`);
    const parsed = JSON.parse(await readFile(artifactPath, "utf8")) as {
      contractName?: unknown;
      abi?: unknown;
      bytecode?: unknown;
    };
    if (parsed.contractName !== plan.contractName) throw new Error(`artifact contract mismatch for ${plan.contractName}`);
    if (!Array.isArray(parsed.abi)) throw new Error(`artifact ABI is invalid for ${plan.contractName}`);
    if (typeof parsed.bytecode !== "string" || !/^0x[0-9a-fA-F]+$/.test(parsed.bytecode) || parsed.bytecode === "0x") {
      throw new Error(`artifact bytecode is invalid for ${plan.contractName}`);
    }
    return { contractName: plan.contractName, abi: parsed.abi, bytecode: parsed.bytecode };
  }
}
