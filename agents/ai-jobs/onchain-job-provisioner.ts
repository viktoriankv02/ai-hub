import { Contract, ContractTransactionResponse, Interface, MaxUint256, Signer, id } from "ethers";
import type { AIJobRecord } from "./types.js";
import type { OnchainJobBindingStore } from "./onchain-job-bindings.js";

const ENGINE_ABI = [
  "function createJob(uint256 agentId, bytes32 taskHash, uint256 reward) returns (uint256 jobId)",
  "function assignJob(uint256 jobId)",
  "function jobs(uint256) view returns (uint256 id, address creator, uint256 agentId, bytes32 taskHash, uint256 reward, bool assigned, bool completed, uint256 createdAt, uint256 completedAt, bytes32 resultHash)",
  "event JobCreated(uint256 indexed jobId, address indexed creator, uint256 indexed agentId, uint256 reward, bytes32 taskHash)",
];
const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

export interface OnchainJobProvisionerOptions {
  signer: Signer;
  engineAddress: string;
  rewardTokenAddress: string;
  bindings: OnchainJobBindingStore;
  resolveAgentId: (offchainAgentId: string) => Promise<bigint | number | string>;
  autoAssign?: boolean;
  assignmentSigner?: Signer;
  approvalAmount?: bigint;
}

export interface OnchainJobProvisioningResult {
  offchainJobId: string;
  onchainJobId: bigint;
  transactionId: string;
  assignmentTransactionId?: string;
  approvalTransactionId?: string;
  reused: boolean;
}

function required(value: string, name: string): string {
  if (!value.trim()) throw new Error(`${name} is required`);
  return value;
}

function taskHashBytes32(value: string): string {
  return /^0x[0-9a-fA-F]{64}$/.test(value) ? value : id(value);
}

function rewardAmount(value: string): bigint {
  try {
    const amount = BigInt(value);
    if (amount > 0n) return amount;
  } catch {}
  throw new Error("job reward must be a positive integer token amount");
}

export class OnchainJobProvisioner {
  private readonly engine: Contract;
  private readonly assignmentEngine: Contract;
  private readonly token: Contract;
  private readonly iface = new Interface(ENGINE_ABI);

  constructor(private readonly options: OnchainJobProvisionerOptions) {
    required(options.engineAddress, "engineAddress");
    required(options.rewardTokenAddress, "rewardTokenAddress");
    this.engine = new Contract(options.engineAddress, ENGINE_ABI, options.signer);
    this.assignmentEngine = new Contract(options.engineAddress, ENGINE_ABI, options.assignmentSigner ?? options.signer);
    this.token = new Contract(options.rewardTokenAddress, ERC20_ABI, options.signer);
  }

  async provision(job: AIJobRecord): Promise<OnchainJobProvisioningResult> {
    const existing = this.options.bindings.get(job.id);
    if (existing !== undefined) {
      let assignmentTransactionId: string | undefined;
      if (this.options.autoAssign) {
        const onchainJob = await this.engine.jobs(existing);
        if (!onchainJob.completed && !onchainJob.assigned) {
          const assignment = (await this.assignmentEngine.assignJob(existing)) as ContractTransactionResponse;
          await assignment.wait();
          assignmentTransactionId = assignment.hash;
        }
      }
      return {
        offchainJobId: job.id,
        onchainJobId: existing,
        transactionId: "reused",
        assignmentTransactionId,
        reused: true,
      };
    }

    const agentId = BigInt(await this.options.resolveAgentId(job.agentId));
    if (agentId < 1n) throw new Error("resolved agentId must be positive");
    const reward = rewardAmount(job.reward);
    const taskHash = taskHashBytes32(job.taskHash);

    let approvalTransactionId: string | undefined;
    const owner = await this.options.signer.getAddress();
    const allowance = BigInt(await this.token.allowance(owner, this.options.engineAddress));
    if (allowance < reward) {
      const approval = (await this.token.approve(
        this.options.engineAddress,
        this.options.approvalAmount ?? MaxUint256,
      )) as ContractTransactionResponse;
      await approval.wait();
      approvalTransactionId = approval.hash;
    }

    const transaction = (await this.engine.createJob(agentId, taskHash, reward)) as ContractTransactionResponse;
    const receipt = await transaction.wait();
    if (!receipt) throw new Error("createJob transaction receipt was not available");

    let onchainJobId: bigint | undefined;
    for (const log of receipt.logs) {
      try {
        const parsed = this.iface.parseLog(log);
        if (parsed?.name === "JobCreated") {
          onchainJobId = BigInt(parsed.args[0]);
          break;
        }
      } catch {}
    }
    if (onchainJobId === undefined) throw new Error("JobCreated event was not found in createJob receipt");

    this.options.bindings.set(job.id, onchainJobId);

    let assignmentTransactionId: string | undefined;
    if (this.options.autoAssign) {
      const assignment = (await this.assignmentEngine.assignJob(onchainJobId)) as ContractTransactionResponse;
      await assignment.wait();
      assignmentTransactionId = assignment.hash;
    }

    return {
      offchainJobId: job.id,
      onchainJobId,
      transactionId: transaction.hash,
      assignmentTransactionId,
      approvalTransactionId,
      reused: false,
    };
  }

  async resolveOnchainJobId(offchainJobId: string): Promise<bigint> {
    const idValue = this.options.bindings.get(required(offchainJobId, "offchainJobId"));
    if (idValue === undefined) throw new Error(`no onchain job binding for ${offchainJobId}`);
    return idValue;
  }
}
