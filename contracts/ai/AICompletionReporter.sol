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
/// @notice Verifies a signed AI-job completion, completes the on-chain job and
///         emits one canonical verified activity atomically.
contract AICompletionReporter is Ownable {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    using Strings for uint256;

    IAIAgentEngineCompletion public immutable engine;
    IActivityRegistryCompletion public immutable activityRegistry;

    mapping(address => bool) public authorizedCallers;
    mapping(address => bool) public attesters;
    mapping(bytes32 => bool) public submittedCompletions;

    event AuthorizedCallerSet(address indexed caller, bool enabled);
    event AttesterSet(address indexed attester, bool enabled);
    event CompletionReported(
        uint256 indexed jobId,
        uint256 indexed agentId,
        address indexed user,
        bytes32 resultHash,
        bytes32 completionId,
        uint256 activityId,
        address attester
    );

    error InvalidJob();
    error JobAlreadyCompleted();
    error CompletionAlreadySubmitted();
    error EmptyResultHash();
    error InvalidAttestation();
    error UnauthorizedAttester();
    error ZeroAddress();

    constructor(address initialOwner, address engineAddress, address activityRegistryAddress)
        Ownable(initialOwner)
    {
        if (engineAddress == address(0) || activityRegistryAddress == address(0)) revert ZeroAddress();
        engine = IAIAgentEngineCompletion(engineAddress);
        activityRegistry = IActivityRegistryCompletion(activityRegistryAddress);
    }

    modifier onlyAuthorizedCaller() {
        if (msg.sender != owner() && !authorizedCallers[msg.sender]) {
            revert OwnableUnauthorizedAccount(msg.sender);
        }
        _;
    }

    function setAuthorizedCaller(address caller, bool enabled) external onlyOwner {
        if (caller == address(0)) revert ZeroAddress();
        authorizedCallers[caller] = enabled;
        emit AuthorizedCallerSet(caller, enabled);
    }

    function setAttester(address attester, bool enabled) external onlyOwner {
        if (attester == address(0)) revert ZeroAddress();
        attesters[attester] = enabled;
        emit AttesterSet(attester, enabled);
    }

    function completionDigest(
        uint256 jobId,
        string calldata agentId,
        string calldata taskHash,
        string calldata resultHash,
        string calldata completedAt
    ) public pure returns (bytes32) {
        bytes32 payloadHash = keccak256(abi.encodePacked(
            "AI_HUB_JOB_COMPLETION_V1\n",
            "jobId=", jobId.toString(), "\n",
            "agentId=", agentId, "\n",
            "taskHash=", taskHash, "\n",
            "resultHash=", resultHash, "\n",
            "completedAt=", completedAt
        ));
        return payloadHash.toEthSignedMessageHash();
    }

    function expectedCompletionId(
        uint256 jobId,
        string calldata agentId,
        string calldata taskHash,
        string calldata resultHash,
        string calldata completedAt,
        address attester
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            "AI_HUB_JOB_COMPLETION_V1", "\n",
            jobId.toString(), "\n",
            agentId, "\n",
            taskHash, "\n",
            resultHash, "\n",
            completedAt, "\n",
            Strings.toHexString(uint160(attester), 20)
        ));
    }

    function submitVerifiedCompletion(
        uint256 jobId,
        string calldata agentId,
        string calldata taskHash,
        string calldata resultHash,
        string calldata completedAt,
        bytes calldata signature,
        bytes32 activityType,
        bytes32 projectId,
        bytes32 metadataHash,
        bytes32 completionId
    ) external onlyAuthorizedCaller returns (uint256 activityId) {
        if (bytes(resultHash).length == 0) revert EmptyResultHash();
        if (completionId == bytes32(0) || submittedCompletions[completionId]) {
            revert CompletionAlreadySubmitted();
        }

        (
            uint256 idValue,
            address creator,
            uint256 agentIdValue,
            bytes32 taskHashValue,
            ,
            bool assigned,
            bool completed,
            ,
            ,
        ) = engine.jobs(jobId);

        if (idValue != jobId || !assigned) revert InvalidJob();
        if (completed) revert JobAlreadyCompleted();
        if (bytes(completedAt).length == 0 || keccak256(bytes(taskHash)) != taskHashValue) {
            revert InvalidAttestation();
        }

        address attester = completionDigest(jobId, agentId, taskHash, resultHash, completedAt).recover(signature);
        if (!attesters[attester]) revert UnauthorizedAttester();
        if (completionId != expectedCompletionId(jobId, agentId, taskHash, resultHash, completedAt, attester)) {
            revert InvalidAttestation();
        }

        bytes32 onchainResultHash = keccak256(bytes(resultHash));
        submittedCompletions[completionId] = true;

        engine.completeJob(jobId, onchainResultHash);
        activityId = activityRegistry.recordActivity(
            creator,
            block.chainid,
            activityType,
            projectId,
            metadataHash,
            true
        );

        emit CompletionReported(
            jobId,
            agentIdValue,
            creator,
            onchainResultHash,
            completionId,
            activityId,
            attester
        );
    }
}
