import {
  Contract,
  ContractTransactionResponse,
  id,
  isHexString,
} from "ethers";
import type { Signer } from "ethers";
import type { CompletionAttestation, CompletionAttestationSink } from "./completion-bridge.js";
import {
  assertValidCompletionAttestation,
  completionIdFromPayload,
  resultHashBytes32,
} from "./completion-attestation.js";

const COMPLETION_REPORTER_ABI = [
  "function submitVerifiedCompletion(uint256 jobId, string agentId, string taskHash, string resultHash, string completedAt, bytes signature, bytes32 activityType, bytes32 projectId, bytes32 metadataHash, bytes32 completionId) returns (uint256 activityId)",
];

export interface EVMCompletionSinkOptions {
  signer: Signer;
  reporterAddress: string;
  activityType: string;
  projectId?: string;
  metadataHash?: string;
  resolveOnchainJobId: (offchainJobId: string) => Promise<bigint | number | string>;
}

export interface EVMCompletionSubmission {
  transaction: ContractTransactionResponse;
  transactionId: string;
  completionId: string;
  onchainJobId: bigint;
  resultHash: string;
}

function bytes32(value: string, label: string): string {
  if (isHexString(value, 32)) return value;
  throw new Error(`${label} must be a 32-byte hex value`);
}

/**
 * Real EVM sink for the completion-attestation bridge.
 *
 * The sink verifies the attestation locally before submitting it. The reporter
 * verifies the same signature again on-chain, so a compromised relayer cannot
 * forge a completion without a configured attester key.
 */
export class EVMCompletionSink implements CompletionAttestationSink {
  private readonly contract: Contract;
  private readonly options: EVMCompletionSinkOptions;

  constructor(options: EVMCompletionSinkOptions) {
    if (!options.reporterAddress) throw new Error("reporterAddress is required");
    if (!options.activityType) throw new Error("activityType is required");
    this.options = options;
    this.contract = new Contract(options.reporterAddress, COMPLETION_REPORTER_ABI, options.signer);
  }

  async submit(attestation: CompletionAttestation): Promise<string> {
    const submission = await this.submitDetailed(attestation);
    return submission.transactionId;
  }

  async submitDetailed(attestation: CompletionAttestation): Promise<EVMCompletionSubmission> {
    assertValidCompletionAttestation(attestation);

    const onchainJobId = BigInt(await this.options.resolveOnchainJobId(attestation.jobId));
    if (onchainJobId < 1n) throw new Error("resolved on-chain job id must be positive");

    const resultHash = resultHashBytes32(attestation.resultHash);
    const activityType = id(this.options.activityType);
    const projectId = id(this.options.projectId ?? attestation.agentId);
    const metadataHash = this.options.metadataHash
      ? bytes32(this.options.metadataHash, "metadataHash")
      : resultHash;

    // Must exactly match AICompletionReporter.expectedCompletionId().
    const completionId = completionIdFromPayload(attestation, attestation.signer);

    const transaction = (await this.contract.submitVerifiedCompletion(
      onchainJobId,
      attestation.agentId,
      attestation.taskHash,
      attestation.resultHash,
      attestation.completedAt,
      attestation.signature,
      activityType,
      projectId,
      metadataHash,
      completionId,
    )) as ContractTransactionResponse;

    return {
      transaction,
      transactionId: transaction.hash,
      completionId,
      onchainJobId,
      resultHash,
    };
  }
}

export function createEVMCompletionSink(options: EVMCompletionSinkOptions): EVMCompletionSink {
  return new EVMCompletionSink(options);
}
