// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IActivityRegistry} from "../interfaces/IActivityRegistry.sol";
import {IChainAdapter} from "../interfaces/IChainAdapter.sol";

interface IChainRegistry {
    function isSupported(uint256 chainId) external view returns (bool);
    function getChain(uint256 chainId) external view returns (uint256, bytes32, bytes32, address, bool, bool);
}

contract ActivityReporter is Ownable {
    IActivityRegistry public immutable registry;
    IChainRegistry public immutable chainRegistry;
    mapping(address => bool) public reporters;
    mapping(address => mapping(uint256 => bool)) public supportedChains;

    event ReporterSet(address indexed reporter, bool enabled);
    event ReporterChainSet(address indexed reporter, uint256 indexed chainId, bool enabled);
    event ActivitySubmitted(address indexed reporter, address indexed user, uint256 indexed activityId, uint256 chainId);

    constructor(address initialOwner, address registryAddress, address chainRegistryAddress) Ownable(initialOwner) {
        require(registryAddress != address(0), "Reporter: zero registry");
        require(chainRegistryAddress != address(0), "Reporter: zero chain registry");
        registry = IActivityRegistry(registryAddress);
        chainRegistry = IChainRegistry(chainRegistryAddress);
    }

    function setReporter(address reporter, bool enabled) external onlyOwner {
        require(reporter != address(0), "Reporter: zero reporter");
        reporters[reporter] = enabled;
        emit ReporterSet(reporter, enabled);
    }

    function setSupportedChain(address reporter, uint256 chainId, bool enabled) external onlyOwner {
        require(reporters[reporter], "Reporter: inactive");
        require(chainRegistry.isSupported(chainId), "Reporter: chain unsupported");
        supportedChains[reporter][chainId] = enabled;
        emit ReporterChainSet(reporter, chainId, enabled);
    }

    function submit(address user, uint256 chainId, bytes32 activityType, bytes32 projectId, bytes32 metadataHash, bool verified)
        external returns (uint256 activityId)
    {
        require(reporters[msg.sender], "Reporter: unauthorized");
        require(supportedChains[msg.sender][chainId], "Reporter: unsupported chain");
        require(chainRegistry.isSupported(chainId), "Reporter: chain inactive");
        require(verified, "Reporter: activity not verified");
        activityId = registry.recordActivity(user, chainId, activityType, projectId, metadataHash, true);
        emit ActivitySubmitted(msg.sender, user, activityId, chainId);
    }

    function submitWithAdapter(address user, uint256 chainId, bytes32 sourceActivityId, bytes32 activityType, bytes32 projectId, bytes calldata proof)
        external returns (uint256 registryActivityId)
    {
        require(reporters[msg.sender], "Reporter: unauthorized");
        require(supportedChains[msg.sender][chainId], "Reporter: unsupported chain");
        require(chainRegistry.isSupported(chainId), "Reporter: chain inactive");

        (, , , address adapter, bool active, ) = chainRegistry.getChain(chainId);
        require(active, "Reporter: chain inactive");
        require(adapter != address(0), "Reporter: no adapter");

        IChainAdapter target = IChainAdapter(adapter);
        require(target.isAvailable(), "Reporter: adapter unavailable");
        require(target.chainId() == chainId, "Reporter: adapter chain mismatch");
        require(target.verifyActivity(sourceActivityId, user, proof), "Reporter: proof invalid");

        registryActivityId = registry.recordActivity(user, chainId, activityType, projectId, keccak256(proof), true);
        emit ActivitySubmitted(msg.sender, user, registryActivityId, chainId);
    }
}
