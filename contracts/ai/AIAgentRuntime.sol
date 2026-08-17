// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AIAgentRuntime
/// @notice Registry and lifecycle controller for AI agents that can execute funded jobs.
/// @dev Owners remain in control of their own agents while trusted orchestrators can
///      perform operational lifecycle actions through an explicit controller role.
contract AIAgentRuntime is Ownable {
    enum AgentStatus {
        Inactive,
        Running,
        Paused,
        Stopped,
        Slashed
    }

    struct Agent {
        uint256 id;
        address owner;
        string name;
        string endpoint;
        string metadataURI;
        string version;
        uint256 createdAt;
        uint256 updatedAt;
        uint256 heartbeatAt;
        AgentStatus status;
        bool verified;
        bool exists;
    }

    uint256 public nextAgentId = 1;
    mapping(uint256 => Agent) private _agents;
    mapping(address => uint256[]) private _ownerAgents;
    mapping(address => bool) public controllers;

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string name);
    event AgentVerified(uint256 indexed agentId, bool verified);
    event AgentStatusChanged(uint256 indexed agentId, AgentStatus status);
    event AgentHeartbeat(uint256 indexed agentId, uint256 timestamp);
    event AgentMetadataUpdated(uint256 indexed agentId);
    event ControllerSet(address indexed controller, bool enabled);

    error AgentNotFound();
    error NotAgentOwner();
    error ZeroAddress();

    constructor(address initialOwner) Ownable(initialOwner) {}

    modifier onlyAgentOperator(uint256 agentId) {
        Agent storage agent = _agents[agentId];
        if (!agent.exists) revert AgentNotFound();
        if (agent.owner != msg.sender && !controllers[msg.sender]) revert NotAgentOwner();
        _;
    }

    function setController(address controller, bool enabled) external onlyOwner {
        if (controller == address(0)) revert ZeroAddress();
        controllers[controller] = enabled;
        emit ControllerSet(controller, enabled);
    }

    function registerAgent(
        string calldata name,
        string calldata endpoint,
        string calldata metadataURI,
        string calldata version
    ) external returns (uint256 agentId) {
        agentId = nextAgentId++;
        _agents[agentId] = Agent({
            id: agentId,
            owner: msg.sender,
            name: name,
            endpoint: endpoint,
            metadataURI: metadataURI,
            version: version,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            heartbeatAt: block.timestamp,
            status: AgentStatus.Inactive,
            verified: false,
            exists: true
        });
        _ownerAgents[msg.sender].push(agentId);
        emit AgentRegistered(agentId, msg.sender, name);
    }

    function setVerified(uint256 agentId, bool verified) external onlyOwner {
        if (!_agents[agentId].exists) revert AgentNotFound();
        _agents[agentId].verified = verified;
        _agents[agentId].updatedAt = block.timestamp;
        emit AgentVerified(agentId, verified);
    }

    function setStatus(uint256 agentId, AgentStatus status) external onlyOwner {
        if (!_agents[agentId].exists) revert AgentNotFound();
        _agents[agentId].status = status;
        _agents[agentId].updatedAt = block.timestamp;
        emit AgentStatusChanged(agentId, status);
    }

    function startAgent(uint256 agentId) external onlyAgentOperator(agentId) {
        _agents[agentId].status = AgentStatus.Running;
        _agents[agentId].updatedAt = block.timestamp;
        emit AgentStatusChanged(agentId, AgentStatus.Running);
    }

    function pauseAgent(uint256 agentId) external onlyAgentOperator(agentId) {
        _agents[agentId].status = AgentStatus.Paused;
        _agents[agentId].updatedAt = block.timestamp;
        emit AgentStatusChanged(agentId, AgentStatus.Paused);
    }

    function stopAgent(uint256 agentId) external onlyAgentOperator(agentId) {
        _agents[agentId].status = AgentStatus.Stopped;
        _agents[agentId].updatedAt = block.timestamp;
        emit AgentStatusChanged(agentId, AgentStatus.Stopped);
    }

    function heartbeat(uint256 agentId) external onlyAgentOperator(agentId) {
        _agents[agentId].heartbeatAt = block.timestamp;
        _agents[agentId].updatedAt = block.timestamp;
        emit AgentHeartbeat(agentId, block.timestamp);
    }

    function updateMetadata(
        uint256 agentId,
        string calldata endpoint,
        string calldata metadataURI,
        string calldata version
    ) external onlyAgentOperator(agentId) {
        Agent storage agent = _agents[agentId];
        agent.endpoint = endpoint;
        agent.metadataURI = metadataURI;
        agent.version = version;
        agent.updatedAt = block.timestamp;
        emit AgentMetadataUpdated(agentId);
    }

    function ownerAgents(address owner) external view returns (uint256[] memory) {
        return _ownerAgents[owner];
    }

    function agentOwner(uint256 agentId) external view returns (address) {
        if (!_agents[agentId].exists) revert AgentNotFound();
        return _agents[agentId].owner;
    }

    function isAgentVerified(uint256 agentId) external view returns (bool) {
        if (!_agents[agentId].exists) revert AgentNotFound();
        return _agents[agentId].verified;
    }

    function agentExists(uint256 agentId) external view returns (bool) {
        return _agents[agentId].exists;
    }

    function agentStatus(uint256 agentId) external view returns (AgentStatus) {
        if (!_agents[agentId].exists) revert AgentNotFound();
        return _agents[agentId].status;
    }

    function canExecute(uint256 agentId) external view returns (bool) {
        Agent storage agent = _agents[agentId];
        return agent.exists && agent.verified && agent.status == AgentStatus.Running;
    }
}
