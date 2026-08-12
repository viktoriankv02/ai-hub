import { Contract, ContractTransactionResponse, Signer } from "ethers";

const ENGINE_ABI = ["function payReward(uint256 jobId) returns (uint256 amount)"];

export interface OnchainRewardSettlement {
  onchainJobId: bigint;
  transactionId: string;
  amount: bigint;
}

export class OnchainRewardSettler {
  private readonly engine: Contract;

  constructor(private readonly signer: Signer, engineAddress: string) {
    if (!engineAddress.trim()) throw new Error("engineAddress is required");
    this.engine = new Contract(engineAddress, ENGINE_ABI, signer);
  }

  async settle(onchainJobId: bigint): Promise<OnchainRewardSettlement> {
    if (onchainJobId < 1n) throw new Error("onchainJobId must be positive");
    const transaction = (await this.engine.payReward(onchainJobId)) as ContractTransactionResponse;
    const receipt = await transaction.wait();
    if (!receipt) throw new Error("payReward transaction receipt was not available");

    // AIAgentEngine emits JobRewardPaid(jobId, receiver, amount). The amount
    // can be obtained from the transaction result through the public job state
    // in a follow-up read, so keep the adapter independent of event ABI here.
    return {
      onchainJobId,
      transactionId: transaction.hash,
      amount: 0n,
    };
  }
}
