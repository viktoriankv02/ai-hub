// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title AIComputeNodeRegistry
/// @notice Registry for physical/virtual compute nodes that execute AI jobs.
/// @dev Agent identity and compute capacity are deliberately separate. An agent
///      describes the software identity; a node describes the execution resource.
contract AIComputeNodeRegistry is Ownable {
    using SafeERC20 for IERC20;

    enum NodeStatus {
        Offline,
        Online,
        Busy,
        Disabled,
        Slashed
    }

    struct ComputeNode {
        uint256 id;
        address owner;
        string name;
        string gpuModel;
        uint32 gpuMemoryGb;
        uint16 cpuCores;
        uint32 ramGb;
        string region;
        uint256 stake;
        uint256 reputation;
        uint256 completedJobs;
        uint256 failedJobs;
        uint256 activeJobs;
        uint256 totalRewards;
        uint256 lastHeartbeat;
        NodeStatus status;
        bool exists;
    }

    IERC20 public immutable stakeToken;
    uint256 public nextNodeId = 1;
    uint256 public minimumStake;
    uint256 public heartbeatTimeout = 15 minutes;

    mapping(uint256 => ComputeNode) private _nodes;
    mapping(address => uint256[]) private _ownerNodes;
    mapping(address => bool) public jobControllers;

    event NodeRegistered(uint256 indexed nodeId, address indexed owner, string name, uint256 stake);
    event NodeMetadataUpdated(uint256 indexed nodeId);
    event NodeHeartbeat(uint256 indexed nodeId, uint256 timestamp);
    event NodeStatusChanged(uint256 indexed nodeId, NodeStatus status);
    event JobControllerSet(address indexed controller, bool enabled);
    event NodeJobStarted(uint256 indexed nodeId, uint256 activeJobs);
    event NodeJobFinished(uint256 indexed nodeId, uint256 reward, bool success, uint256 reputation);
    event NodeSlashed(uint256 indexed nodeId, uint256 amount, address indexed receiver);
    event StakeWithdrawn(uint256 indexed nodeId, uint256 amount);
    event RegistryParametersSet(uint256 minimumStake, uint256 heartbeatTimeout);

    error NodeNotFound();
    error NotNodeOwner();
    error UnauthorizedController();
    error InvalidStake();
    error NodeDisabled();
    error NodeNotOnline();
    error HeartbeatExpired();
    error NoActiveJobs();
    error StakeLocked();
    error InvalidHeartbeatTimeout();
    error InvalidController();

    constructor(address initialOwner, address token, uint256 initialMinimumStake) Ownable(initialOwner) {
        require(token != address(0), "Node: zero token");
        stakeToken = IERC20(token);
        minimumStake = initialMinimumStake;
    }

    modifier onlyNodeOwner(uint256 nodeId) {
        ComputeNode storage node = _nodes[nodeId];
        if (!node.exists) revert NodeNotFound();
        if (node.owner != msg.sender) revert NotNodeOwner();
        _;
    }

    modifier onlyController() {
        if (!jobControllers[msg.sender]) revert UnauthorizedController();
        _;
    }

    function setRegistryParameters(uint256 newMinimumStake, uint256 newHeartbeatTimeout) external onlyOwner {
        if (newHeartbeatTimeout == 0) revert InvalidHeartbeatTimeout();
        minimumStake = newMinimumStake;
        heartbeatTimeout = newHeartbeatTimeout;
        emit RegistryParametersSet(newMinimumStake, newHeartbeatTimeout);
    }

    function setJobController(address controller, bool enabled) external onlyOwner {
        if (controller == address(0)) revert InvalidController();
        jobControllers[controller] = enabled;
        emit JobControllerSet(controller, enabled);
    }

    function registerNode(
        string calldata name,
        string calldata gpuModel,
        uint32 gpuMemoryGb,
        uint16 cpuCores,
        uint32 ramGb,
        string calldata region,
        uint256 stake
    ) external returns (uint256 nodeId) {
        if (stake < minimumStake) revert InvalidStake();
        stakeToken.safeTransferFrom(msg.sender, address(this), stake);

        nodeId = nextNodeId++;
        _nodes[nodeId] = ComputeNode({
            id: nodeId,
            owner: msg.sender,
            name: name,
            gpuModel: gpuModel,
            gpuMemoryGb: gpuMemoryGb,
            cpuCores: cpuCores,
            ramGb: ramGb,
            region: region,
            stake: stake,
            reputation: 100,
            completedJobs: 0,
            failedJobs: 0,
            activeJobs: 0,
            totalRewards: 0,
            lastHeartbeat: block.timestamp,
            status: NodeStatus.Online,
            exists: true
        });
        _ownerNodes[msg.sender].push(nodeId);
        emit NodeRegistered(nodeId, msg.sender, name, stake);
    }

    function updateNode(
        uint256 nodeId,
        string calldata name,
        string calldata gpuModel,
        uint32 gpuMemoryGb,
        uint16 cpuCores,
        uint32 ramGb,
        string calldata region
    ) external onlyNodeOwner(nodeId) {
        ComputeNode storage node = _nodes[nodeId];
        node.name = name;
        node.gpuModel = gpuModel;
        node.gpuMemoryGb = gpuMemoryGb;
        node.cpuCores = cpuCores;
        node.ramGb = ramGb;
        node.region = region;
        emit NodeMetadataUpdated(nodeId);
    }

    function heartbeat(uint256 nodeId) external onlyNodeOwner(nodeId) {
        ComputeNode storage node = _nodes[nodeId];
        if (node.status == NodeStatus.Disabled || node.status == NodeStatus.Slashed) revert NodeDisabled();
        node.lastHeartbeat = block.timestamp;
        if (node.status == NodeStatus.Offline) {
            node.status = NodeStatus.Online;
            emit NodeStatusChanged(nodeId, NodeStatus.Online);
        }
        emit NodeHeartbeat(nodeId, block.timestamp);
    }

    function markBusy(uint256 nodeId) external onlyController {
        ComputeNode storage node = _nodes[nodeId];
        if (!node.exists) revert NodeNotFound();
        if (node.status == NodeStatus.Disabled || node.status == NodeStatus.Slashed) revert NodeDisabled();
        if (!_heartbeatHealthy(node)) revert HeartbeatExpired();
        if (node.status != NodeStatus.Online) revert NodeNotOnline();
        node.status = NodeStatus.Busy;
        node.activeJobs += 1;
        emit NodeJobStarted(nodeId, node.activeJobs);
        emit NodeStatusChanged(nodeId, NodeStatus.Busy);
    }

    function finishJob(uint256 nodeId, uint256 reward, bool success) external onlyController {
        ComputeNode storage node = _nodes[nodeId];
        if (!node.exists) revert NodeNotFound();
        if (node.activeJobs == 0) revert NoActiveJobs();
        node.activeJobs -= 1;
        if (success) {
            node.completedJobs += 1;
            node.totalRewards += reward;
            node.reputation = node.reputation >= 1000 ? 1000 : node.reputation + 1;
        } else {
            node.failedJobs += 1;
            node.reputation = node.reputation == 0 ? 0 : node.reputation - 5;
        }
        node.status = node.activeJobs == 0 ? NodeStatus.Online : NodeStatus.Busy;
        emit NodeJobFinished(nodeId, reward, success, node.reputation);
        emit NodeStatusChanged(nodeId, node.status);
    }

    function disableNode(uint256 nodeId) external onlyNodeOwner(nodeId) {
        ComputeNode storage node = _nodes[nodeId];
        node.status = NodeStatus.Disabled;
        emit NodeStatusChanged(nodeId, NodeStatus.Disabled);
    }

    function withdrawStake(uint256 nodeId) external onlyNodeOwner(nodeId) returns (uint256 amount) {
        ComputeNode storage node = _nodes[nodeId];
        if (node.activeJobs != 0) revert StakeLocked();
        if (node.status == NodeStatus.Busy) revert StakeLocked();
        amount = node.stake;
        node.stake = 0;
        node.status = NodeStatus.Disabled;
        stakeToken.safeTransfer(node.owner, amount);
        emit StakeWithdrawn(nodeId, amount);
    }

    function slash(uint256 nodeId, uint256 amount, address receiver) external onlyOwner {
        ComputeNode storage node = _nodes[nodeId];
        if (!node.exists) revert NodeNotFound();
        require(receiver != address(0), "Node: zero receiver");
        require(amount > 0 && amount <= node.stake, "Node: invalid slash");
        node.stake -= amount;
        node.reputation = node.reputation > 10 ? node.reputation - 10 : 0;
        if (node.stake < minimumStake) node.status = NodeStatus.Slashed;
        stakeToken.safeTransfer(receiver, amount);
        emit NodeSlashed(nodeId, amount, receiver);
        emit NodeStatusChanged(nodeId, node.status);
    }

    function getNode(uint256 nodeId) external view returns (ComputeNode memory) {
        if (!_nodes[nodeId].exists) revert NodeNotFound();
        return _nodes[nodeId];
    }

    function ownerNodes(address owner) external view returns (uint256[] memory) {
        return _ownerNodes[owner];
    }

    function isHealthy(uint256 nodeId) external view returns (bool) {
        ComputeNode storage node = _nodes[nodeId];
        return node.exists && _heartbeatHealthy(node) && node.status != NodeStatus.Disabled && node.status != NodeStatus.Slashed;
    }

    function _heartbeatHealthy(ComputeNode storage node) internal view returns (bool) {
        return block.timestamp <= node.lastHeartbeat + heartbeatTimeout;
    }
}
