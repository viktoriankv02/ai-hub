// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IAIJobEngineAdapter {
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

interface IAIAgentRuntimeAdapter {
    function agentOwner(uint256 agentId) external view returns (address);
    function isAgentVerified(uint256 agentId) external view returns (bool);
    function agentExists(uint256 agentId) external view returns (bool);
}

interface IActivityRegistryAdapter {
    function recordActivity(
        address user,
        uint256 chainId,
        bytes32 activityType,
        bytes32 projectId,
        bytes32 metadataHash,
        bool verified
    ) external returns (uint256 activityId);
}

/// @title AIJobActivityAdapter
/// @notice Converts completed AI jobs into the canonical ActivityRegistry format.
/// @dev This keeps AI execution as an adapter instead of creating a second reward ledger.
contract AIJobActivityAdapter is Ownable {
    IAIJobEngineAdapter public immutable jobEngine;
    IAIAgentRuntimeAdapter public immutable runtime;
    IActivityRegistryAdapter public immutable activityRegistry;

    uint256 public immutable sourceChainId;
    bytes32 public immutable activityType;
    bytes32 public immutable projectId;

    mapping(address => bool) public reporters;
    mapping(uint256 => bool) public reported;

    event ReporterSet(address indexed reporter, bool enabled);
    event JobActivityReported(uint256 indexed jobId, address indexed beneficiary, uint256 indexed activityId);

    error UnauthorizedReporter();
    error InvalidJob();
    error InvalidAgent();
    error AlreadyReported();

    constructor(
        address initialOwner,
        address jobEngineAddress,
        address runtimeAddress,
        address registryAddress,
        uint256 chainId,
        bytes32 jobActivityType,
        bytes32 jobProjectId
    ) Ownable(initialOwner) {
        require(jobEngineAddress != address(0), "Adapter: zero engine");
        require(runtimeAddress != address(0), "Adapter: zero runtime");
        require(registryAddress != address(0), "Adapter: zero registry");
        require(chainId != 0, "Adapter: zero chain");
        require(jobActivityType != bytes32(0), "Adapter: zero activity");
        require(jobProjectId != bytes32(0), "Adapter: zero project");
        jobEngine = IAIJobEngineAdapter(jobEngineAddress);
        runtime = IAIAgentRuntimeAdapter(runtimeAddress);
        activityRegistry = IActivityRegistryAdapter(registryAddress);
        sourceChainId = chainId;
        activityType = jobActivityType;
        projectId = jobProjectId;
    }

    modifier onlyReporter() {
        if (!reporters[msg.sender]) revert UnauthorizedReporter();
        _;
    }

    function setReporter(address reporter, bool enabled) external onlyOwner {
        require(reporter != address(0), "Adapter: zero reporter");
        reporters[reporter] = enabled;
        emit ReporterSet(reporter, enabled);
    }

    function reportCompletedJob(uint256 jobId, bytes32 metadataHash)
        external
        onlyReporter
        returns (uint256 activityId)
    {
        if (reported[jobId]) revert AlreadyReported();

        (
            uint256 id,
            ,
            uint256 agentId,
            ,
            ,
            bool assigned,
            bool completed,
            ,
            ,
            bytes32 resultHash
        ) = jobEngine.jobs(jobId);

        if (id != jobId || !assigned || !completed || resultHash == bytes32(0)) revert InvalidJob();

        if (!runtime.agentExists(agentId) || !runtime.isAgentVerified(agentId)) revert InvalidAgent();
        address beneficiary = runtime.agentOwner(agentId);
        if (beneficiary == address(0)) revert InvalidAgent();

        bytes32 finalMetadataHash = metadataHash == bytes32(0)
            ? keccak256(abi.encode(jobId, resultHash))
            : metadataHash;

        activityId = activityRegistry.recordActivity(
            beneficiary,
            sourceChainId,
            activityType,
            projectId,
            finalMetadataHash,
            true
        );

        reported[jobId] = true;
        emit JobActivityReported(jobId, beneficiary, activityId);
    }
}
