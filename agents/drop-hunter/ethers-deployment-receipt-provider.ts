import { JsonRpcProvider } from "ethers";
import { chains } from "../../config/chains.js";
import type { DeploymentReceipt, DeploymentReceiptProvider } from "./contract-deployment-receipt.js";

export class EthersDeploymentReceiptProvider implements DeploymentReceiptProvider {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async getReceipt(transactionHash: string, chainId: number): Promise<DeploymentReceipt> {
    const chain = chains.find((item) => item.chainId === chainId);
    if (!chain || chain.kind !== "evm") throw new Error(`EVM chain is not registered: ${chainId}`);
    if (!chain.rpcEnv) throw new Error(`RPC environment variable is not configured for ${chain.name}`);
    const rpcUrl = this.env[chain.rpcEnv]?.trim();
    if (!rpcUrl) throw new Error(`RPC endpoint is missing: ${chain.rpcEnv}`);

    const provider = new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
    const receipt = await provider.getTransactionReceipt(transactionHash);
    if (!receipt) return { transactionHash, status: "pending" };
    return {
      transactionHash: receipt.hash,
      status: receipt.status === 1 ? "success" : "failed",
      contractAddress: receipt.contractAddress ?? undefined,
      blockNumber: receipt.blockNumber,
    };
  }
}
