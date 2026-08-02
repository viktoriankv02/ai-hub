// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IAdapterManagerRegistry {
    function getChain(uint256 chainId) external view returns (
        uint256,
        bytes32,
        bytes32,
        address,
        bool
    );
}

interface IAdapterManagerAdapter {
    function chainId() external view returns (uint256);
    function vmType() external view returns (bytes32);
    function isAvailable() external view returns (bool);
    function verifyActivity(bytes32 activityId, address user, bytes calldata proof) external view returns (bool);
}

/// @title AI Hub Adapter Manager
/// @notice Provides one verification entry point for registered chain adapters.
contract AdapterManager is Ownable {
    IAdapterManagerRegistry public immutable registry;

    mapping(uint256 => bool) public enabled;

    event AdapterEnabled(uint256 indexed chainId, address indexed adapter, bool enabled);

    constructor(address initialOwner, address registryAddress) Ownable(initialOwner) {
        require(registryAddress != address(0), "AdapterManager: zero registry");
        registry = IAdapterManagerRegistry(registryAddress);
    }

    function setEnabled(uint256 chainId, bool isEnabled) external onlyOwner {
        (uint256 registeredId,,,, bool active) = registry.getChain(chainId);
        require(registeredId == chainId, "AdapterManager: unknown chain");
        require(active || !isEnabled, "AdapterManager: chain inactive");
        enabled[chainId] = isEnabled;

        (,,, address adapter,) = registry.getChain(chainId);
        emit AdapterEnabled(chainId, adapter, isEnabled);
    }

    function verifyActivity(
        uint256 chainId,
        bytes32 activityId,
        address user,
        bytes calldata proof
    ) external view returns (bool) {
        require(enabled[chainId], "AdapterManager: adapter disabled");
        (uint256 registeredId,, bytes32 vmType, address adapter, bool active) = registry.getChain(chainId);
        require(registeredId == chainId && active, "AdapterManager: unsupported chain");
        require(adapter != address(0), "AdapterManager: zero adapter");
        require(IAdapterManagerAdapter(adapter).chainId() == chainId, "AdapterManager: chain mismatch");
        require(IAdapterManagerAdapter(adapter).vmType() == vmType, "AdapterManager: VM mismatch");
        require(IAdapterManagerAdapter(adapter).isAvailable(), "AdapterManager: unavailable");

        return IAdapterManagerAdapter(adapter).verifyActivity(activityId, user, proof);
    }

    function adapterOf(uint256 chainId) external view returns (address adapter, bytes32 vmType, bool active) {
        (uint256 registeredId,, bytes32 registeredVm, address registeredAdapter, bool registeredActive) = registry.getChain(chainId);
        require(registeredId == chainId, "AdapterManager: unknown chain");
        return (registeredAdapter, registeredVm, registeredActive);
    }
}
