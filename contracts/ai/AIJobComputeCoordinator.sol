// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IAIJobEngineCoordinator {
    function jobs(uint256 jobId) external view returns (
        uint256 id,
        address creator,
        uint256 agentId,
        bytes32 taskHash,
        uint256 reward,
        bool assigned,
        bool completed,
        uint256 createdAt,
        uint256 completedAt,
        bytes32 resultHash
    );
}

interface IAIComputeNodeCoordinator {
    function isAvailable(uint256 nodeId) external view returns (bool);
    function startJob(uint256 jobId, uint256 nodeId) external;
    function finishJob(uint256 jobId, uint256 nodeId, uint256 reward) external;
    function failJob(uint256 jobId, uint256 nodeId) external;
}

/// @title AIJobComputeCoordinator
/// @notice Permissioned binding between funded AI jobs and registered compute nodes.
/// @dev The coordinator never controls job principal or user rewards.
contract AIJobComputeCoordinator is Ownable {
    struct Execution {
        uint256 jobId;
        uint256 nodeId;
        uint256 startedAt;
        uint256 finishedAt;
        uint256 computeReward;
        bool active;
        bool completed;
        bool failed;
    }

    IAIJobEngineCoordinator public immutable jobEngine;
    IAIComputeNodeCoordinator public immutable nodeRegistry;
    mapping(address => bool) public controllers;
    mapping(uint256 => Execution) private _executions;
    mapping(uint256 => uint256) public nodeByJob;
    mapping(uint256 => uint256) public jobByNode;

    event ControllerSet(address indexed controller, bool enabled);
    event JobBound(uint256 indexed jobId, uint256 indexed nodeId);
    event JobExecutionStarted(uint256 indexed jobId, uint256 indexed nodeId, uint256 timestamp);
    event JobExecutionCompleted(uint256 indexed jobId, uint256 indexed nodeId, uint256 computeReward);
    event JobExecutionFailed(uint256 indexed jobId, uint256 indexed nodeId);

    error NotController();
    error InvalidJob();
    error JobAlreadyBound();
    error NodeAlreadyBusy();
    error NodeUnavailable();
    error InvalidExecution();
    error ExecutionAlreadyFinished();
    error ZeroAddress();

    constructor(address initialOwner, address engineAddress, address nodeRegistryAddress) Ownable(initialOwner) {
        if (engineAddress == address(0) || nodeRegistryAddress == address(0)) revert ZeroAddress();
        jobEngine = IAIJobEngineCoordinator(engineAddress);
        nodeRegistry = IAIComputeNodeCoordinator(nodeRegistryAddress);
    }

    modifier onlyController() {
        if (!controllers[msg.sender]) revert NotController();
        _;
    }

    function setController(address controller, bool enabled) external onlyOwner {
        if (controller == address(0)) revert ZeroAddress();
        controllers[controller] = enabled;
        emit ControllerSet(controller, enabled);
    }

    function bindAndStart(uint256 jobId, uint256 nodeId) external onlyController {
        _validateJob(jobId);
        if (nodeByJob[jobId] != 0) revert JobAlreadyBound();
        if (jobByNode[nodeId] != 0) revert NodeAlreadyBusy();
        if (!nodeRegistry.isAvailable(nodeId)) revert NodeUnavailable();

        nodeByJob[jobId] = nodeId;
        jobByNode[nodeId] = jobId;
        _executions[jobId] = Execution({
            jobId: jobId,
            nodeId: nodeId,
            startedAt: block.timestamp,
            finishedAt: 0,
            computeReward: 0,
            active: true,
            completed: false,
            failed: false
        });

        emit JobBound(jobId, nodeId);
        nodeRegistry.startJob(jobId, nodeId);
        emit JobExecutionStarted(jobId, nodeId, block.timestamp);
    }

    function complete(uint256 jobId, uint256 computeReward) external onlyController {
        Execution storage execution = _executions[jobId];
        if (!execution.active || execution.completed || execution.failed) revert InvalidExecution();
        if (execution.finishedAt != 0) revert ExecutionAlreadyFinished();

        execution.active = false;
        execution.completed = true;
        execution.finishedAt = block.timestamp;
        execution.computeReward = computeReward;
        delete jobByNode[execution.nodeId];

        nodeRegistry.finishJob(jobId, execution.nodeId, computeReward);
        emit JobExecutionCompleted(jobId, execution.nodeId, computeReward);
    }

    function fail(uint256 jobId) external onlyController {
        Execution storage execution = _executions[jobId];
        if (!execution.active || execution.completed || execution.failed) revert InvalidExecution();
        if (execution.finishedAt != 0) revert ExecutionAlreadyFinished();

        execution.active = false;
        execution.failed = true;
        execution.finishedAt = block.timestamp;
        delete jobByNode[execution.nodeId];

        nodeRegistry.failJob(jobId, execution.nodeId);
        emit JobExecutionFailed(jobId, execution.nodeId);
    }

    function getExecution(uint256 jobId) external view returns (Execution memory) {
        return _executions[jobId];
    }

    function executionActive(uint256 jobId) external view returns (bool) {
        return _executions[jobId].active;
    }

    function _validateJob(uint256 jobId) internal view {
        (uint256 idValue, , , , , bool assigned, bool completed, , , ) = jobEngine.jobs(jobId);
        if (idValue != jobId || !assigned || completed) revert InvalidJob();
    }
}
