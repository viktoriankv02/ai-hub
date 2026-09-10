import { Contract, id, parseUnits } from "ethers";
import type { Signer } from "ethers";
import type { AIJobRecord } from "./types.js";
import type { OnchainJobBindingStore } from "./onchain-job-bindings.js";

const ENGINE_ABI = [
  "event JobCreated(uint256 indexed jobId,address indexed creator,uint256 indexed agentId,uint256 reward,bytes32 taskHash)",
  "function createJob(uint256 agentId, bytes32 taskHash, uint256 reward) returns (uint256 jobId)",
  "function assignJob(uint256 jobId)",
];

export interface OnchainJobProvisionerOptions {
  signer: Signer;
  engineAddress: string;
  bindingStore?: OnchainJobBindingStore;
  bindings?: OnchainJobBindingStore;
  tokenDecimals?: number;
  agentId?: bigint | number | string;
  resolveAgentId?: (agentId: string) => Promise<bigint | number | string>;
  assignmentSigner?: Signer;
  rewardTokenAddress?: string;
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

export class OnchainJobProvisioner {
  private readonly engine: Contract;
  private readonly assignmentEngine: Contract;
  private readonly options: Required<Pick<OnchainJobProvisionerOptions, "signer" | "engineAddress" | "autoAssign" | "tokenDecimals">> & OnchainJobProvisionerOptions;

  constructor(options: OnchainJobProvisionerOptions) {
    if (!options.engineAddress) throw new Error("engineAddress is required");
    const bindingStore = options.bindingStore ?? options.bindings;
    if (!bindingStore) throw new Error("bindingStore is required");

    this.options = {
      tokenDecimals: 18,
      autoAssign: false,
      ...options,
      bindingStore,
    };
    this.engine = new Contract(options.engineAddress, ENGINE_ABI, options.signer);
    this.assignmentEngine = new Contract(
      options.engineAddress,
      ENGINE_ABI,
      options.assignmentSigner ?? options.signer,
    );
  }

  async provision(job: AIJobRecord): Promise<OnchainJobProvisioningResult> {
    if (!job.id.trim()) throw new Error("job.id is required");
    if (!job.taskHash.trim()) throw new Error("job.taskHash is required");
    if (!job.reward.trim()) throw new Error("job.reward is required");

    const existing = this.options.bindingStore!.get(job.id);
    if (existing !== undefined) {
      return {
        offchainJobId: job.id,
        onchainJobId: assertJobId(existing),
        reused: true,
      };
    }

    const reward = parseUnits(job.reward, this.options.tokenDecimals);
    if (reward <= 0n) throw new Error("job.reward must be positive");

    const agentId = await this.resolveAgentId(job.agentId);
    if (agentId < 1n) throw new Error("resolved agent id must be positive");

    const tx = await this.engine.createJob(agentId, taskHashBytes32(job.taskHash), reward);
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
    if (onchainJobId === undefined) throw new Error("JobCreated event not found in createJob receipt");

    this.options.bindingStore!.set(job.id, onchainJobId);

    let assignedTransactionId: string | undefined;
    if (this.options.autoAssign) {
      const assignTx = await this.assignmentEngine.assignJob(onchainJobId);
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

  async resolveOnchainJobId(offchainJobId: string): Promise<bigint> {
    const value = this.options.bindingStore!.get(offchainJobId);
    if (value === undefined) throw new Error(`no on-chain binding exists for off-chain job '${offchainJobId}'`);
    return assertJobId(value);
  }

  private async resolveAgentId(agentId: string): Promise<bigint> {
    if (this.options.resolveAgentId) {
      return BigInt(await this.options.resolveAgentId(agentId));
    }
    if (this.options.agentId !== undefined) return BigInt(this.options.agentId);
    throw new Error(`cannot resolve off-chain agentId '${agentId}' to an on-chain agent id`);
  }
}

export function createOnchainJobProvisioner(
  options: OnchainJobProvisionerOptions,
): OnchainJobProvisioner {
  return new OnchainJobProvisioner(options);
}
