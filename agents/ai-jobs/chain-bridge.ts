import {
  Contract,
  type ContractTransactionReceipt,
  type ContractTransactionResponse,
  type Signer,
  ethers,
} from "ethers";
import type { AIJobRecord } from "./types.js";

const COMPLETION_ADAPTER_ABI = [
  "function bridgeCompletion(uint256 jobId, bytes32 resultHash, bytes32 metadataHash) returns (uint256 activityId)",
  "function reportedJobs(uint256 jobId) view returns (bool)",
  "function completionCallers(address) view returns (bool)",
];

export interface AIJobChainBridgeOptions {
  adapterAddress: string;
  signer: Signer;
}

export interface PreparedCompletionAttestation {
  jobId: bigint;
  resultHash: string;
  metadataHash: string;
  completionKey: string;
}

export interface BridgedCompletion {
  jobId: bigint;
  resultHash: string;
  metadataHash: string;
  activityId?: bigint;
  transaction: ContractTransactionResponse;
  receipt: ContractTransactionReceipt;
}

function assertBytes32(value: string, field: string): string {
  if (!ethers.isHexString(value, 32)) {
    throw new Error(`${field} must be a bytes32 hex value`);
  }
  return value;
}

/**
 * Convert an off-chain execution result into the canonical bytes32 value used
 * by the completion adapter. Existing executor formats such as
 * `sha256:<hex>` and `dry-run:<hex>` are intentionally preserved as input
 * strings and hashed once with keccak256 at the trust boundary.
 */
export function canonicalResultHash(resultHash: string): string {
  const value = resultHash.trim();
  if (!value) throw new Error("resultHash is required");

  if (ethers.isHexString(value, 32)) return value;
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

export function canonicalMetadataHash(metadata: string): string {
  const value = metadata.trim();
  if (!value) throw new Error("metadataHash is required");
  if (ethers.isHexString(value, 32)) return value;
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

export function completionKey(jobId: bigint, resultHash: string, metadataHash: string): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["uint256", "bytes32", "bytes32"],
      [jobId, canonicalResultHash(resultHash), canonicalMetadataHash(metadataHash)],
    ),
  );
}

/**
 * EVM-side client for the atomic AIJobCompletionAdapter.
 *
 * The bridge deliberately accepts only a completed off-chain AIJobRecord and
 * refuses to manufacture a chain job id from an off-chain UUID. The caller
 * must persist the mapping between AIJobRecord.id and on-chain jobId.
 */
export class AIJobCompletionBridge {
  private readonly contract: Contract;

  constructor(private readonly options: AIJobChainBridgeOptions) {
    if (!ethers.isAddress(options.adapterAddress)) {
      throw new Error("adapterAddress must be a valid EVM address");
    }
    this.contract = new Contract(options.adapterAddress, COMPLETION_ADAPTER_ABI, options.signer);
  }

  prepare(
    job: AIJobRecord,
    onChainJobId: bigint,
    metadataHash: string,
  ): PreparedCompletionAttestation {
    if (job.status !== "completed") {
      throw new Error(`job ${job.id} is not completed`);
    }
    if (!job.resultHash?.trim()) {
      throw new Error(`job ${job.id} has no result hash`);
    }
    if (onChainJobId < 1n) {
      throw new Error("onChainJobId must be positive");
    }

    const resultHash = assertBytes32(canonicalResultHash(job.resultHash), "resultHash");
    const normalizedMetadata = assertBytes32(canonicalMetadataHash(metadataHash), "metadataHash");

    return {
      jobId: onChainJobId,
      resultHash,
      metadataHash: normalizedMetadata,
      completionKey: completionKey(onChainJobId, resultHash, normalizedMetadata),
    };
  }

  async isReported(onChainJobId: bigint): Promise<boolean> {
    return Boolean(await this.contract.reportedJobs(onChainJobId));
  }

  async canSubmit(callerAddress: string): Promise<boolean> {
    if (!ethers.isAddress(callerAddress)) throw new Error("callerAddress must be a valid EVM address");
    return Boolean(await this.contract.completionCallers(callerAddress));
  }

  async bridge(
    job: AIJobRecord,
    onChainJobId: bigint,
    metadataHash: string,
  ): Promise<BridgedCompletion> {
    const prepared = this.prepare(job, onChainJobId, metadataHash);

    if (await this.isReported(prepared.jobId)) {
      throw new Error(`on-chain AI job ${prepared.jobId} has already been bridged`);
    }

    const transaction = await this.contract.bridgeCompletion(
      prepared.jobId,
      prepared.resultHash,
      prepared.metadataHash,
    );
    const receipt = await transaction.wait();
    if (!receipt) throw new Error("completion transaction was dropped before confirmation");

    let activityId: bigint | undefined;
    try {
      const adapterInterface = this.contract.interface;
      for (const log of receipt.logs) {
        const parsed = adapterInterface.parseLog(log);
        if (parsed?.name === "JobCompletionBridged") {
          activityId = BigInt(parsed.args.activityId);
          break;
        }
      }
    } catch {
      // The transaction is still successful. Activity id is optional because
      // RPC providers can return logs in a shape ethers cannot parse.
    }

    return {
      jobId: prepared.jobId,
      resultHash: prepared.resultHash,
      metadataHash: prepared.metadataHash,
      activityId,
      transaction,
      receipt,
    };
  }
}
