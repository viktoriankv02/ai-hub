// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

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
/// @notice Atomic bridge from a verified off-chain completion into the AI job
///         engine and canonical ActivityRegistry.
/// @dev Signature verification belongs to the off-chain completion-attestation
///      layer. This contract is the execution boundary: its caller must already
///      be authorized by AIAgentEngine as a completion reporter.
contract AICompletionReporter is Ownable {
    IAIAgentEngineCompletion public immutable engine;
    IActivityRegistryCompletion public immutable activityRegistry;

    mapping(bytes32 => bool) public submittedCompletions;

    event CompletionReported(
        uint256 indexed jobId,
        uint256 indexed agentId,
        address indexed user,
        bytes32 resultHash,
        bytes32 completionId,
        uint256 activityId
    );

    error InvalidJob();
    error JobAlreadyCompleted();
    error CompletionAlreadySubmitted();
    error EmptyResultHash();

    constructor(address initialOwner, address engineAddress, address activityRegistryAddress)
        Ownable(initialOwner)
    {
        require(engineAddress != address(0), "Reporter: zero engine");
        require(activityRegistryAddress != address(0), "Reporter: zero registry");
        engine = IAIAgentEngineCompletion(engineAddress);
        activityRegistry = IActivityRegistryCompletion(activityRegistryAddress);
    }

    function submitVerifiedCompletion(
        uint256 jobId,
        bytes32 resultHash,
        bytes32 activityType,
        bytes32 projectId,
        bytes32 metadataHash,
        bytes32 completionId
    ) external returns (uint256 activityId) {
        if (resultHash == bytes32(0)) revert EmptyResultHash();
        if (completionId == bytes32(0) || submittedCompletions[completionId]) {
            revert CompletionAlreadySubmitted();
        }

        IAIAgentEngineCompletion.AIJob memory job = engine.jobs(jobId);
        if (job.id != jobId || !job.assigned) revert InvalidJob();
        if (job.completed) revert JobAlreadyCompleted();

        submittedCompletions[completionId] = true;

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
            activityId
        );
    }
}
