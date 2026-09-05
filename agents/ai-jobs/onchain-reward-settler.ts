import { Contract } from "ethers";
import type { Signer } from "ethers";

const ENGINE_ABI = [
  "function payReward(uint256 jobId) returns (uint256 amount)",
];

export class OnchainRewardSettler {
  private readonly engine: Contract;

  constructor(signer: Signer, engineAddress: string) {
    if (!engineAddress.trim()) throw new Error("engineAddress is required");
    this.engine = new Contract(engineAddress, ENGINE_ABI, signer);
  }

  async settle(onchainJobId: bigint | number | string): Promise<string> {
    const id = BigInt(onchainJobId);
    if (id < 1n) throw new Error("onchain job id must be positive");
    const tx = await this.engine.payReward(id);
    await tx.wait();
    return tx.hash;
  }

  async settleReward(onchainJobId: bigint | number | string): Promise<string> {
    return this.settle(onchainJobId);
  }
}
