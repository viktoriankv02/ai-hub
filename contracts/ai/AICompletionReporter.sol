// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IAIAgentEngineCompletion {
    struct AIJob {
        uint256 id;
        address creator;
        uint256 agentId;
        bytes32 taskHash;
        uint256 reward;
        bool assigned;
        bool completed;
        uint256 createdAt;
        uint256 completedAt;
        bytes32 resultHash;
    }

    function jobs(uint256 jobId) external view returns (AIJob memory);
    function completeJob(uint256 jobId, bytes32 resultHash) external;
}

interface IActivityRegistryCompletion {
    function recordActivity(
        address user,
        uint256 chainId,
        bytes32 activityType,
        bytes32 projectId,
        bytes32 metadataHash,
        bool verified
    ) external returns (uint256 activityId);
}

/// @title AICompletionReporter
/// @notice Verifies signed off-chain AI completion evidence and bridges it into
///         the canonical AI job and activity ledgers.
/// @dev The reporter is deliberately a small trust-boundary contract. The
///      off-chain signer proves what was executed; AIAgentEngine remains the
///      source of truth for job state and ActivityRegistry remains the source
///      of truth for user activity.
contract AICompletionReporter is Ownable {
    using ECDSA for bytes32;

    bytes32 public constant ATTESTATION_VERSION = keccak256("AI_HUB_JOB_COMPLETION_V1");

    IAIAgentEngineCompletion public immutable engine;
    IActivityRegistryCompletion public immutable activityRegistry;

    mapping(address => bool) public attestationSigners;
    mapping(bytes32 => bool) public submittedAttestations;

    event AttestationSignerSet(address indexed signer, bool enabled);
    event CompletionReported(
        uint256 indexed jobId,
        uint256 indexed agentId,
        address indexed user,
        bytes32 taskHash,
        bytes32 resultHash,
        bytes32 attestationId,
        uint256 activityId
    );

    error UnauthorizedAttestationSigner();
    error InvalidAttestation();
    error AttestationAlreadySubmitted();
    error JobNotReportable();

    constructor(address initialOwner, address engineAddress, address activityRegistryAddress)
        Ownable(initialOwner)
    {
        require(engineAddress != address(0), "Reporter: zero engine");
        require(activityRegistryAddress != address(0), "Reporter: zero registry");
        engine = IAIAgentEngineCompletion(engineAddress);
        activityRegistry = IActivityRegistryCompletion(activityRegistryAddress);
    }

    function setAttestationSigner(address signer, bool enabled) external onlyOwner {
        require(signer != address(0), "Reporter: zero signer");
        attestationSigners[signer] = enabled;
        emit AttestationSignerSet(signer, enabled);
    }

    function submitCompletion(
        uint256 jobId,
        bytes32 resultHash,
        uint256 completedAt,
        bytes32 activityType,
        bytes32 projectId,
        bytes32 metadataHash,
        bytes calldata signature
    ) external returns (uint256 activityId) {
        IAIAgentEngineCompletion.AIJob memory job = engine.jobs(jobId);
        if (job.id != jobId || !job.assigned || job.completed || resultHash == bytes32(0)) {
            revert JobNotReportable();
        }
        if (completedAt == 0 || completedAt > block.timestamp) revert InvalidAttestation();

        bytes32 payloadHash = keccak256(
            abi.encodePacked(
                "AI_HUB_JOB_COMPLETION_V1\n",
                "jobId=", _toString(jobId), "\n",
                "agentId=", _toString(job.agentId), "\n",
                "taskHash=", _hex(job.taskHash), "\n",
                "resultHash=", _hex(resultHash), "\n",
                "completedAt=", _toString(completedAt)
            )
        );

        address signer = payloadHash.toEthSignedMessageHash().recover(signature);
        if (!attestationSigners[signer]) revert UnauthorizedAttestationSigner();

        bytes32 attestationId = keccak256(
            abi.encodePacked(jobId, job.agentId, job.taskHash, resultHash, completedAt, signer)
        );
        if (submittedAttestations[attestationId]) revert AttestationAlreadySubmitted();
        submittedAttestations[attestationId] = true;

        engine.completeJob(jobId, resultHash);

        activityId = activityRegistry.recordActivity(
            job.creator,
            block.chainid,
            activityType,
            projectId,
            metadataHash,
            true
        );

        emit CompletionReported(
            jobId,
            job.agentId,
            job.creator,
            job.taskHash,
            resultHash,
            attestationId,
            activityId
        );
    }

    function canonicalMessageHash(
        uint256 jobId,
        uint256 agentId,
        bytes32 taskHash,
        bytes32 resultHash,
        uint256 completedAt
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "AI_HUB_JOB_COMPLETION_V1\n",
                "jobId=", _toString(jobId), "\n",
                "agentId=", _toString(agentId), "\n",
                "taskHash=", _hex(taskHash), "\n",
                "resultHash=", _hex(resultHash), "\n",
                "completedAt=", _toString(completedAt)
            )
        );
    }

    function _hex(bytes32 value) internal pure returns (string memory) {
        bytes memory symbols = "0123456789abcdef";
        bytes memory output = new bytes(64);
        for (uint256 i = 0; i < 32; i++) {
            uint8 b = uint8(value[i]);
            output[i * 2] = symbols[b >> 4];
            output[i * 2 + 1] = symbols[b & 0x0f];
        }
        return string(output);
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
