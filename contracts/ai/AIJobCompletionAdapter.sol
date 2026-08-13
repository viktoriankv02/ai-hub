// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IAIJobCompletionEngine {
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

interface IAIJobActivityReporter {
    function submit(
        address user,
        uint256 chainId,
        bytes32 activityType,
        bytes32 projectId,
        bytes32 metadataHash,
        bool verified
    ) external returns (uint256 activityId);
}

/// @title AIJobCompletionAdapter
/// @notice Atomic trust-boundary adapter for AI job completions.
/// @dev The configured completion caller is an off-chain orchestrator/attestor.
///      This contract must itself be authorized as an AIAgentEngine completion
///      reporter and as an ActivityReporter reporter. The whole operation is one
///      transaction: if activity recording fails, job completion also reverts.
contract AIJobCompletionAdapter is Ownable {
    IAIJobCompletionEngine public immutable engine;
    IAIJobActivityReporter public immutable activityReporter;
    uint256 public immutable sourceChainId;
    bytes32 public immutable activityType;
    bytes32 public immutable projectId;

    mapping(address => bool) public completionCallers;
    mapping(uint256 => bool) public reportedJobs;

    event CompletionCallerSet(address indexed caller, bool enabled);
    event JobCompletionBridged(
        uint256 indexed jobId,
        uint256 indexed agentId,
        address indexed user,
        bytes32 resultHash,
        bytes32 metadataHash,
        uint256 activityId
    );

    error UnauthorizedCaller();
    error InvalidJob();
    error AlreadyReported();
    error EmptyResultHash();
    error ZeroCaller();

    constructor(
        address initialOwner,
        address engineAddress,
        address activityReporterAddress,
        uint256 sourceChain,
        bytes32 jobActivityType,
        bytes32 jobProjectId
    ) Ownable(initialOwner) {
        require(engineAddress != address(0), "Adapter: zero engine");
        require(activityReporterAddress != address(0), "Adapter: zero reporter");
        require(sourceChain != 0, "Adapter: zero chain");
        require(jobActivityType != bytes32(0), "Adapter: zero activity type");
        require(jobProjectId != bytes32(0), "Adapter: zero project");

        engine = IAIJobCompletionEngine(engineAddress);
        activityReporter = IAIJobActivityReporter(activityReporterAddress);
        sourceChainId = sourceChain;
        activityType = jobActivityType;
        projectId = jobProjectId;
    }

    modifier onlyCompletionCaller() {
        if (!completionCallers[msg.sender]) revert UnauthorizedCaller();
        _;
    }

    function setCompletionCaller(address caller, bool enabled) external onlyOwner {
        if (caller == address(0)) revert ZeroCaller();
        completionCallers[caller] = enabled;
        emit CompletionCallerSet(caller, enabled);
    }

    function bridgeCompletion(
        uint256 jobId,
        bytes32 resultHash,
        bytes32 metadataHash
    ) external onlyCompletionCaller returns (uint256 activityId) {
        if (resultHash == bytes32(0)) revert EmptyResultHash();
        if (reportedJobs[jobId]) revert AlreadyReported();

        IAIJobCompletionEngine.AIJob memory job = engine.jobs(jobId);
        if (job.id != jobId || !job.assigned || job.completed) revert InvalidJob();

        // Mark before the external calls. A revert rolls this state back.
        reportedJobs[jobId] = true;

        engine.completeJob(jobId, resultHash);
        activityId = activityReporter.submit(
            job.creator,
            sourceChainId,
            activityType,
            projectId,
            metadataHash,
            true
        );

        emit JobCompletionBridged(
            jobId,
            job.agentId,
            job.creator,
            resultHash,
            metadataHash,
            activityId
        );
    }
}
