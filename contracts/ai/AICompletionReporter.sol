// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

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
/// @notice Verifies signed off-chain AI completion attestations before crossing
///         the trust boundary into AIAgentEngine and ActivityRegistry.
/// @dev The transaction sender is only the transport/relayer. The attestation
///      signer is independently authenticated on-chain and can be rotated by
///      the owner without changing the relayer account.
contract AICompletionReporter is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    bytes32 public constant ATTESTATION_VERSION = keccak256("AI_HUB_JOB_COMPLETION_V1");

    IAIAgentEngineCompletion public immutable engine;
    IActivityRegistryCompletion public immutable activityRegistry;

    mapping(address => bool) public completionCallers;
    mapping(address => bool) public attestors;
    mapping(bytes32 => bool) public submittedCompletions;
    mapping(uint256 => bool) public completedJobs;

    event CompletionCallerSet(address indexed caller, bool enabled);
    event AttestorSet(address indexed attestor, bool enabled);
    event CompletionReported(
        uint256 indexed jobId,
        uint256 indexed agentId,
        address indexed user,
        bytes32 resultHash,
        bytes32 completionId,
        uint256 activityId,
        address attestor
    );

    error UnauthorizedCaller();
    error UnauthorizedAttestor();
    error InvalidJob();
    error JobAlreadyCompleted();
    error CompletionAlreadySubmitted();
    error EmptyResultHash();
    error ZeroAddress();
    error InvalidSignature();

    constructor(address initialOwner, address engineAddress, address activityRegistryAddress)
        Ownable(initialOwner)
    {
        if (engineAddress == address(0) || activityRegistryAddress == address(0)) {
            revert ZeroAddress();
        }
        engine = IAIAgentEngineCompletion(engineAddress);
        activityRegistry = IActivityRegistryCompletion(activityRegistryAddress);
    }

    modifier onlyCompletionCaller() {
        if (!completionCallers[msg.sender]) revert UnauthorizedCaller();
        _;
    }

    function setCompletionCaller(address caller, bool enabled) external onlyOwner {
        if (caller == address(0)) revert ZeroAddress();
        completionCallers[caller] = enabled;
        emit CompletionCallerSet(caller, enabled);
    }

    function setAttestor(address attestor, bool enabled) external onlyOwner {
        if (attestor == address(0)) revert ZeroAddress();
        attestors[attestor] = enabled;
        emit AttestorSet(attestor, enabled);
    }

    function completionMessageHash(
        uint256 jobId,
        uint256 agentId,
        bytes32 taskHash,
        bytes32 resultHash,
        uint256 completedAt
    ) public pure returns (bytes32) {
        bytes memory message = abi.encodePacked(
            "AI_HUB_JOB_COMPLETION_V1\n",
            "jobId=",
            Strings.toString(jobId),
            "\nagentId=",
            Strings.toString(agentId),
            "\ntaskHash=",
            _hex32(taskHash),
            "\nresultHash=",
            _hex32(resultHash),
            "\ncompletedAt=",
            Strings.toString(completedAt)
        );
        return keccak256(message);
    }

    function submitVerifiedCompletion(
        uint256 jobId,
        bytes32 resultHash,
        bytes32 activityType,
        bytes32 projectId,
        bytes32 metadataHash,
        bytes32 completionId,
        address attestor,
        bytes calldata signature,
        uint256 attestedCompletedAt
    ) external onlyCompletionCaller returns (uint256 activityId) {
        if (resultHash == bytes32(0)) revert EmptyResultHash();
        if (completionId == bytes32(0) || submittedCompletions[completionId]) {
            revert CompletionAlreadySubmitted();
        }
        if (!attestors[attestor]) revert UnauthorizedAttestor();

        IAIAgentEngineCompletion.AIJob memory job = engine.jobs(jobId);
        if (job.id != jobId || !job.assigned) revert InvalidJob();
        if (job.completed || completedJobs[jobId]) revert JobAlreadyCompleted();
        if (attestedCompletedAt == 0) revert InvalidSignature();

        bytes32 digest = completionMessageHash(
            jobId,
            job.agentId,
            job.taskHash,
            resultHash,
            attestedCompletedAt
        ).toEthSignedMessageHash();

        address recovered = digest.recover(signature);
        if (recovered != attestor) revert InvalidSignature();

        submittedCompletions[completionId] = true;
        completedJobs[jobId] = true;

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
            resultHash,
            completionId,
            activityId,
            attestor
        );
    }

    function _hex32(bytes32 value) private pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory output = new bytes(64);
        for (uint256 i = 0; i < 32; ++i) {
            uint8 current = uint8(value[i]);
            output[i * 2] = alphabet[current >> 4];
            output[i * 2 + 1] = alphabet[current & 0x0f];
        }
        return string(output);
    }
}
