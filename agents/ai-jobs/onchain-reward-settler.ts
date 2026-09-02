import { Contract, ContractTransactionResponse, Signer } from "ethers";

const ENGINE_ABI = [
  "function jobs(uint256) view returns (uint256 id, address creator, uint256 agentId, bytes32 taskHash, uint256 reward, bool assigned, bool completed, uint256 createdAt, uint256 completedAt, bytes32 resultHash)",
  "function payReward(uint256 jobId) returns (uint256 amount)",
];

export interface OnchainRewardSettlement {
  onchainJobId: bigint;
  transactionId: string;
  amount: bigint;
  reused: boolean;
}

export class OnchainRewardSettler {
  private readonly engine: Contract;

  constructor(private readonly signer: Signer, engineAddress: string) {
    if (!engineAddress.trim()) throw new Error("engineAddress is required");
    this.engine = new Contract(engineAddress, ENGINE_ABI, signer);
  }

  async settle(onchainJobId: bigint): Promise<OnchainRewardSettlement> {
    if (onchainJobId < 1n) throw new Error("onchainJobId must be positive");
    const job = await this.engine.jobs(onchainJobId);
    if (!job.completed) throw new Error("cannot settle reward for incomplete onchain job");

    const amount = BigInt(job.reward);
    if (amount === 0n) {
      return { onchainJobId, transactionId: "reused", amount: 0n, reused: true };
    }

    const transaction = (await this.engine.payReward(onchainJobId)) as ContractTransactionResponse;
    await transaction.wait();
    return { onchainJobId, transactionId: transaction.hash, amount, reused: false };
  }
}
