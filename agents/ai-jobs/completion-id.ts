import { solidityPackedKeccak256 } from "ethers";
import type { CompletionAttestationPayload } from "./completion-attestation.js";

/**
 * Builds the same replay key as AICompletionReporter.expectedCompletionId().
 *
 * The attester is encoded as an address rather than as its checksum string so
 * the key is independent of address casing and is byte-for-byte compatible
 * with Solidity's abi.encodePacked(..., attester).
 */
export function canonicalCompletionId(
  payload: CompletionAttestationPayload,
  attester: string,
): string {
  return solidityPackedKeccak256(
    ["string", "string", "string", "string", "string", "string", "string", "address"],
    [
      payload.version,
      "\\n",
      payload.jobId,
      "\\n",
      payload.agentId,
      "\\n",
      payload.taskHash,
      "\\n",
      payload.resultHash,
      "\\n",
      payload.completedAt,
      "\\n",
      attester,
    ],
  );
}
