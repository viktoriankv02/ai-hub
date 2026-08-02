// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IActivityRegistry} from "../interfaces/IActivityRegistry.sol";
import {IChainAdapter} from "../interfaces/IChainAdapter.sol";

contract ActivityReporter is Ownable {
    IActivityRegistry public immutable registry;
    mapping(address => bool) public reporters;
    mapping(address => mapping(uint256 => bool)) public supportedChains;
    mapping(uint256 => address) public chainAdapters;

    event ReporterSet(address indexed reporter, bool enabled);
    event ReporterChainSet(address indexed reporter, uint256 indexed chainId, bool enabled);
    event ChainAdapterSet(uint256 indexed chainId, address indexed adapter);
    event ActivitySubmitted(address indexed reporter, address indexed user, uint256 indexed activityId, uint256 chainId);

    constructor(address initialOwner, address registryAddress) Ownable(initialOwner) {
        require(registryAddress != address(0), "Reporter: zero registry");
        registry = IActivityRegistry(registryAddress);
    }

    function setReporter(address reporter, bool enabled) external onlyOwner {
        require(reporter != address(0), "Reporter: zero reporter");
        reporters[reporter] = enabled;
        emit ReporterSet(reporter, enabled);
    }

    function setSupportedChain(address reporter, uint256 chainId, bool enabled) external onlyOwner {
        require(reporters[reporter], "Reporter: inactive");
        require(chainId != 0, "Reporter: invalid chain");
        supportedChains[reporter][chainId] = enabled;
        emit ReporterChainSet(reporter, chainId, enabled);
    }

    function setChainAdapter(uint256 chainId, address adapter) external onlyOwner {
        require(chainId != 0, "Reporter: invalid chain");
        require(adapter != address(0), "Reporter: zero adapter");
        IChainAdapter target = IChainAdapter(adapter);
        require(target.chainId() == chainId, "Reporter: chain mismatch");
        require(target.isAvailable(), "Reporter: adapter unavailable");
        chainAdapters[chainId] = adapter;
        emit ChainAdapterSet(chainId, adapter);
    }

    function submit(
        address user,
        uint256 chainId,
        bytes32 activityType,
        bytes32 projectId,
        bytes32 metadataHash,
        bool verified
    ) external returns (uint256 activityId) {
        require(reporters[msg.sender], "Reporter: unauthorized");
        require(supportedChains[msg.sender][chainId], "Reporter: unsupported chain");
        require(verified, "Reporter: activity not verified");
        activityId = registry.recordActivity(user, chainId, activityType, projectId, metadataHash, true);
        emit ActivitySubmitted(msg.sender, user, activityId, chainId);
    }

    function submitWithAdapter(
        address user,
        uint256 chainId,
        bytes32 sourceActivityId,
        bytes32 activityType,
        bytes32 projectId,
        bytes calldata proof
    ) external returns (uint256 registryActivityId) {
        require(reporters[msg.sender], "Reporter: unauthorized");
        require(supportedChains[msg.sender][chainId], "Reporter: unsupported chain");
        address adapter = chainAdapters[chainId];
        require(adapter != address(0), "Reporter: adapter not configured");
        IChainAdapter target = IChainAdapter(adapter);
        require(target.isAvailable(), "Reporter: adapter unavailable");
        require(target.verifyActivity(sourceActivityId, user, proof), "Reporter: proof invalid");

        registryActivityId = registry.recordActivity(
            user,
            chainId,
            activityType,
            projectId,
            keccak256(proof),
            true
        );
        emit ActivitySubmitted(msg.sender, user, registryActivityId, chainId);
    }
}
