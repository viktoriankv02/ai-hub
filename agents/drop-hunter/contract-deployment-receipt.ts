import type { DropHunterProjectRepository } from "./product-store.js";

export interface DeploymentReceipt {
  transactionHash: string;
  status: "success" | "failed" | "pending";
  contractAddress?: string;
  blockNumber?: number;
}

export interface DeploymentReceiptProvider {
  getReceipt(transactionHash: string, chainId: number): Promise<DeploymentReceipt>;
}

export interface DeploymentReconciliationResult {
  projectId: string;
  taskId: string;
  chainId: number;
  transactionHash: string;
  status: DeploymentReceipt["status"];
  contractAddress?: string;
  blockNumber?: number;
  taskUpdated: boolean;
}

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export class ContractDeploymentReceiptReconciler {
  constructor(
    private readonly repository: DropHunterProjectRepository,
    private readonly provider: DeploymentReceiptProvider,
  ) {}

  async reconcile(input: {
    projectId: string;
    taskId: string;
    chainId: number;
    transactionHash: string;
  }): Promise<DeploymentReconciliationResult> {
    if (!TX_HASH_RE.test(input.transactionHash)) throw new Error("invalid deployment transaction hash");
    if (!Number.isInteger(input.chainId) || input.chainId <= 0) throw new Error("invalid deployment chain id");

    const receipt = await this.provider.getReceipt(input.transactionHash, input.chainId);
    if (receipt.transactionHash.toLowerCase() !== input.transactionHash.toLowerCase()) {
      throw new Error("receipt transaction hash does not match deployment request");
    }
    if (receipt.contractAddress !== undefined && !ADDRESS_RE.test(receipt.contractAddress)) {
      throw new Error("receipt contract address is invalid");
    }

    if (receipt.status === "success") {
      if (!receipt.contractAddress) throw new Error("successful deployment receipt is missing contract address");
      await this.repository.setTaskStatus(input.projectId, input.taskId, "completed", {
        txHash: input.transactionHash,
        contractAddress: receipt.contractAddress,
        blockNumber: receipt.blockNumber,
      });
      return { ...input, ...receipt, taskUpdated: true };
    }

    if (receipt.status === "failed") {
      await this.repository.setTaskStatus(input.projectId, input.taskId, "failed", {
        error: "contract deployment transaction failed",
        txHash: input.transactionHash,
        blockNumber: receipt.blockNumber,
      });
      return { ...input, ...receipt, taskUpdated: true };
    }

    return { ...input, ...receipt, taskUpdated: false };
  }
}
