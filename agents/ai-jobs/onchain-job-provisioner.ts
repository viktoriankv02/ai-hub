import { Contract, id, parseUnits } from "ethers";
import type { Signer } from "ethers";
import type { AIJobRecord } from "./types.js";
import type { OnchainJobBindingStore } from "./onchain-job-bindings.js";

const ENGINE_ABI = [
  "function createJob(uint256 agentId, bytes32 taskHash, uint256 reward) returns (uint256 jobId)",
  "function assignJob(uint256 jobId)",
  "function jobs(uint256 jobId) view returns (uint256 id,address creator,uint256 agentId,bytes32 taskHash,uint256 reward,bool assigned,bool completed,uint256 createdAt,uint256 completedAt,bytes32 resultHash)",
];

export interface OnchainJobProvisionerOptions {
  signer: Signer;
  engineAddress: string;
  bindingStore: OnchainJobBindingStore;
  tokenDecimals?: number;
  agentId: bigint | number | string;
  autoAssign?: boolean;
}

export interface OnchainJobProvisioningResult {
  offchainJobId: string;
  onchainJobId: bigint;
  createdTransactionId?: string;
  assignedTransactionId?: string;
  reused: boolean;
}

function taskHashBytes32(taskHash: string): string {
  if (/^0x[0-9a-fA-F]{64}$/.test(taskHash)) return taskHash;
  return id(taskHash);
}

function assertJobId(value: bigint): bigint {
  if (value < 1n) throw new Error("onchain job id must be positive");
  return value;
}

/**
 * Bridges an off-chain AIJobRecord into AIAgentEngine.
 *
 * The operation is deliberately idempotent: the persistent binding store is
 * checked before a transaction is sent. This prevents duplicate funded jobs
 * when a worker retries after losing a response.
 */
export class OnchainJobProvisioner {
  private readonly engine: Contract;
  private readonly options: OnchainJobProvisionerOptions;

  constructor(options: OnchainJobProvisionerOptions) {
    if (!options.engineAddress) throw new Error("engineAddress is required");
    this.options = {
      tokenDecimals: 18,
      autoAssign: true,
      ...options,
    };
    this.engine = new Contract(options.engineAddress, ENGINE_ABI, options.signer);
  }

  async provision(job: AIJobRecord): Promise<OnchainJobProvisioningResult> {
    if (!job.id.trim()) throw new Error("job.id is required");
    if (!job.taskHash.trim()) throw new Error("job.taskHash is required");
    if (!job.reward.trim()) throw new Error("job.reward is required");

    const existing = this.options.bindingStore.get(job.id);
    if (existing !== undefined) {
      return {
        offchainJobId: job.id,
        onchainJobId: assertJobId(existing),
        reused: true,
      };
    }

    const reward = parseUnits(job.reward, this.options.tokenDecimals ?? 18);
    if (reward <= 0n) throw new Error("job.reward must be positive");

    const tx = await this.engine.createJob(
      BigInt(this.options.agentId),
      taskHashBytes32(job.taskHash),
      reward,
    );
    const receipt = await tx.wait();
    if (!receipt) throw new Error("createJob transaction did not produce a receipt");

    let onchainJobId: bigint | undefined;
    for (const log of receipt.logs) {
      try {
        const parsed = this.engine.interface.parseLog(log);
        if (parsed?.name === "JobCreated") {
          onchainJobId = BigInt(parsed.args.jobId);
          break;
        }
      } catch {
        // Ignore logs emitted by other contracts.
      }
    }

    if (onchainJobId === undefined) {
      throw new Error("JobCreated event not found in createJob receipt");
    }

    this.options.bindingStore.set(job.id, onchainJobId);

    let assignedTransactionId: string | undefined;
    if (this.options.autoAssign) {
      const assignTx = await this.engine.assignJob(onchainJobId);
      await assignTx.wait();
      assignedTransactionId = assignTx.hash;
    }

    return {
      offchainJobId: job.id,
      onchainJobId,
      createdTransactionId: tx.hash,
      assignedTransactionId,
      reused: false,
    };
  }
}

export function createOnchainJobProvisioner(
  options: OnchainJobProvisionerOptions,
): OnchainJobProvisioner {
  return new OnchainJobProvisioner(options);
}
