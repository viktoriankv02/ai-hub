// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title AIComputeNodeRegistry
/// @notice Staked compute-node registry used by the AI job execution layer.
/// @dev Node owners control metadata and liveness; trusted controllers control
///      job state. The registry never owns an AI job's principal reward.
contract AIComputeNodeRegistry is Ownable {
    using SafeERC20 for IERC20;

    enum NodeStatus { Offline, Online, Busy, Disabled }

    struct ComputeNode {
        uint256 id;
        address owner;
        string endpoint;
        string gpuModel;
        uint32 gpuMemory;
        uint16 cpuCores;
        uint32 ram;
        string region;
        uint256 stake;
        uint256 reputation;
        uint256 completedJobs;
        uint256 failedJobs;
        uint256 lastHeartbeat;
        uint256 totalReward;
        uint256 activeJobs;
        NodeStatus status;
        bool exists;
    }

    IERC20 public immutable stakeToken;
    uint256 public immutable minimumStake;
    uint256 public nextNodeId = 1;
    uint256 public totalStaked;

    mapping(uint256 => ComputeNode) private _nodes;
    mapping(address => uint256[]) private _ownerNodes;
    mapping(address => bool) public controllers;
    mapping(uint256 => uint256) public activeJobByNode;

    event ControllerSet(address indexed controller, bool enabled);
    event NodeRegistered(uint256 indexed nodeId, address indexed owner, uint256 stake);
    event NodeHeartbeat(uint256 indexed nodeId, uint256 timestamp);
    event NodeStatusChanged(uint256 indexed nodeId, NodeStatus status);
    event JobStarted(uint256 indexed jobId, uint256 indexed nodeId);
    event JobFinished(uint256 indexed jobId, uint256 indexed nodeId, uint256 reward);
    event JobFailed(uint256 indexed jobId, uint256 indexed nodeId);
    event StakeWithdrawn(uint256 indexed nodeId, address indexed owner, uint256 amount);

    error NotController();
    error NotNodeOwner();
    error NodeNotFound();
    error InvalidNodeState();
    error JobMismatch();
    error InvalidStake();
    error ActiveJobsExist();
    error ZeroAddress();
    error InvalidPage();

    constructor(address initialOwner, address token, uint256 minStake) Ownable(initialOwner) {
        if (token == address(0)) revert ZeroAddress();
        stakeToken = IERC20(token);
        minimumStake = minStake;
    }

    modifier onlyController() {
        if (!controllers[msg.sender]) revert NotController();
        _;
    }

    modifier validNode(uint256 nodeId) {
        if (!_nodes[nodeId].exists) revert NodeNotFound();
        _;
    }

    modifier onlyNodeOwner(uint256 nodeId) {
        if (!_nodes[nodeId].exists) revert NodeNotFound();
        if (_nodes[nodeId].owner != msg.sender) revert NotNodeOwner();
        _;
    }

    function setController(address controller, bool enabled) external onlyOwner {
        if (controller == address(0)) revert ZeroAddress();
        controllers[controller] = enabled;
        emit ControllerSet(controller, enabled);
    }

    function registerNode(
        string calldata endpoint,
        string calldata gpuModel,
        uint32 gpuMemory,
        uint16 cpuCores,
        uint32 ram,
        string calldata region,
        uint256 stake
    ) external returns (uint256 nodeId) {
        if (stake < minimumStake) revert InvalidStake();
        stakeToken.safeTransferFrom(msg.sender, address(this), stake);

        nodeId = nextNodeId++;
        _nodes[nodeId] = ComputeNode({
            id: nodeId,
            owner: msg.sender,
            endpoint: endpoint,
            gpuModel: gpuModel,
            gpuMemory: gpuMemory,
            cpuCores: cpuCores,
            ram: ram,
            region: region,
            stake: stake,
            reputation: 100,
            completedJobs: 0,
            failedJobs: 0,
            lastHeartbeat: block.timestamp,
            totalReward: 0,
            activeJobs: 0,
            status: NodeStatus.Online,
            exists: true
        });
        _ownerNodes[msg.sender].push(nodeId);
        totalStaked += stake;
        emit NodeRegistered(nodeId, msg.sender, stake);
    }

    function heartbeat(uint256 nodeId) external onlyNodeOwner(nodeId) {
        ComputeNode storage node = _nodes[nodeId];
        if (node.status == NodeStatus.Disabled) revert InvalidNodeState();
        node.lastHeartbeat = block.timestamp;
        emit NodeHeartbeat(nodeId, block.timestamp);
    }

    function setOnline(uint256 nodeId) external onlyNodeOwner(nodeId) {
        ComputeNode storage node = _nodes[nodeId];
        if (node.status == NodeStatus.Disabled || node.activeJobs != 0) revert InvalidNodeState();
        node.status = NodeStatus.Online;
        emit NodeStatusChanged(nodeId, NodeStatus.Online);
    }

    function setOffline(uint256 nodeId) external onlyNodeOwner(nodeId) {
        ComputeNode storage node = _nodes[nodeId];
        if (node.activeJobs != 0) revert ActiveJobsExist();
        if (node.status == NodeStatus.Disabled) revert InvalidNodeState();
        node.status = NodeStatus.Offline;
        emit NodeStatusChanged(nodeId, NodeStatus.Offline);
    }

    function startJob(uint256 jobId, uint256 nodeId) external onlyController validNode(nodeId) {
        ComputeNode storage node = _nodes[nodeId];
        if (node.status != NodeStatus.Online) revert InvalidNodeState();
        node.status = NodeStatus.Busy;
        node.activeJobs += 1;
        activeJobByNode[nodeId] = jobId;
        emit JobStarted(jobId, nodeId);
    }

    function finishJob(uint256 jobId, uint256 nodeId, uint256 reward) external onlyController validNode(nodeId) {
        ComputeNode storage node = _nodes[nodeId];
        if (activeJobByNode[nodeId] != jobId) revert JobMismatch();
        if (node.status != NodeStatus.Busy) revert InvalidNodeState();
        node.status = NodeStatus.Online;
        if (node.activeJobs > 0) node.activeJobs -= 1;
        delete activeJobByNode[nodeId];
        node.completedJobs += 1;
        node.totalReward += reward;
        node.reputation += 1;
        emit JobFinished(jobId, nodeId, reward);
    }

    function failJob(uint256 jobId, uint256 nodeId) external onlyController validNode(nodeId) {
        ComputeNode storage node = _nodes[nodeId];
        if (activeJobByNode[nodeId] != jobId) revert JobMismatch();
        if (node.status != NodeStatus.Busy) revert InvalidNodeState();
        node.status = NodeStatus.Online;
        if (node.activeJobs > 0) node.activeJobs -= 1;
        delete activeJobByNode[nodeId];
        node.failedJobs += 1;
        if (node.reputation > 0) node.reputation -= 1;
        emit JobFailed(jobId, nodeId);
    }

    function disableNode(uint256 nodeId) external onlyNodeOwner(nodeId) {
        ComputeNode storage node = _nodes[nodeId];
        if (node.activeJobs != 0) revert ActiveJobsExist();
        node.status = NodeStatus.Disabled;
        emit NodeStatusChanged(nodeId, NodeStatus.Disabled);
    }

    function withdrawStake(uint256 nodeId) external onlyNodeOwner(nodeId) {
        ComputeNode storage node = _nodes[nodeId];
        if (node.activeJobs != 0) revert ActiveJobsExist();
        if (node.status != NodeStatus.Disabled) revert InvalidNodeState();
        uint256 amount = node.stake;
        node.stake = 0;
        totalStaked -= amount;
        stakeToken.safeTransfer(node.owner, amount);
        emit StakeWithdrawn(nodeId, node.owner, amount);
    }

    function getNode(uint256 nodeId) external view validNode(nodeId) returns (ComputeNode memory) {
        return _nodes[nodeId];
    }

    function ownerNodes(address owner) external view returns (uint256[] memory) {
        return _ownerNodes[owner];
    }

    function nodeExists(uint256 nodeId) external view returns (bool) {
        return _nodes[nodeId].exists;
    }

    function nodeCount() external view returns (uint256) {
        return nextNodeId - 1;
    }

    function listNodeIds(uint256 offset, uint256 limit) external view returns (uint256[] memory ids) {
        uint256 count = nodeCount();
        if (offset > count) revert InvalidPage();
        if (limit == 0) return new uint256[](0);
        uint256 end = offset + limit;
        if (end > count) end = count;
        ids = new uint256[](end - offset);
        for (uint256 i = offset; i < end; i++) ids[i - offset] = i + 1;
    }

    function availableNodeIds(uint256 offset, uint256 limit) external view returns (uint256[] memory ids) {
        uint256 count = nodeCount();
        if (offset > count) revert InvalidPage();
        if (limit == 0) return new uint256[](0);
        uint256[] memory buffer = new uint256[](limit);
        uint256 found;
        uint256 skipped;
        for (uint256 nodeId = 1; nodeId <= count && found < limit; nodeId++) {
            if (_nodes[nodeId].exists && _nodes[nodeId].status == NodeStatus.Online) {
                if (skipped < offset) {
                    skipped++;
                } else {
                    buffer[found++] = nodeId;
                }
            }
        }
        ids = new uint256[](found);
        for (uint256 i = 0; i < found; i++) ids[i] = buffer[i];
    }

    function isAvailable(uint256 nodeId) external view returns (bool) {
        ComputeNode storage node = _nodes[nodeId];
        return node.exists && node.status == NodeStatus.Online;
    }
}
