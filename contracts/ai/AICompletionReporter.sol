// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface ICompletionEngine {
    function jobs(uint256) external view returns (uint256 id, address creator, uint256 agentId, bytes32 taskHash, uint256 reward, bool assigned, bool completed, uint256 createdAt, uint256 completedAt, bytes32 resultHash);
    function completeJob(uint256 jobId, bytes32 resultHash) external;
}

interface ICompletionActivityRegistry {
    function recordActivity(address user, uint256 chainId, bytes32 activityType, bytes32 projectId, bytes32 metadataHash, bool verified) external returns (uint256 activityId);
}

contract AICompletionReporter is Ownable {
    ICompletionEngine public immutable engine;
    ICompletionActivityRegistry public immutable activityRegistry;
    mapping(address => bool) public completionCallers;
    mapping(bytes32 => bool) public submittedCompletions;

    event CompletionCallerSet(address indexed caller, bool enabled);
    event CompletionReported(uint256 indexed jobId, uint256 indexed agentId, address indexed user, bytes32 resultHash, bytes32 completionId, uint256 activityId);

    error UnauthorizedCaller();
    error InvalidJob();
    error JobAlreadyCompleted();
    error CompletionAlreadySubmitted();
    error EmptyResultHash();
    error ZeroCaller();

    constructor(address initialOwner, address engineAddress, address registryAddress) Ownable(initialOwner) {
        require(engineAddress != address(0), "Reporter: zero engine");
        require(registryAddress != address(0), "Reporter: zero registry");
        engine = ICompletionEngine(engineAddress);
        activityRegistry = ICompletionActivityRegistry(registryAddress);
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

    function submitVerifiedCompletion(uint256 jobId, bytes32 resultHash, bytes32 activityType, bytes32 projectId, bytes32 metadataHash, bytes32 completionId) external onlyCompletionCaller returns (uint256 activityId) {
        if (resultHash == bytes32(0)) revert EmptyResultHash();
        if (completionId == bytes32(0) || submittedCompletions[completionId]) revert CompletionAlreadySubmitted();
        (uint256 idValue, address creator, uint256 agentId, , , bool assigned, bool completed, , , ) = engine.jobs(jobId);
        if (idValue != jobId || !assigned) revert InvalidJob();
        if (completed) revert JobAlreadyCompleted();
        submittedCompletions[completionId] = true;
        engine.completeJob(jobId, resultHash);
        activityId = activityRegistry.recordActivity(creator, block.chainid, activityType, projectId, metadataHash, true);
        emit CompletionReported(jobId, agentId, creator, resultHash, completionId, activityId);
    }
}
